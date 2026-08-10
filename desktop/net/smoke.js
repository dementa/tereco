'use strict';

/**
 * Smoke test for package signing, verification and preparation:
 *
 *   node desktop/net/smoke.js
 *
 * The signing half runs on the server and the verifying half on a lab machine,
 * so the two never execute together in production. This is the only place they
 * are checked against each other — a disagreement between them means good
 * packages fail to verify at exam time, which is exactly when nobody can debug
 * it.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  signPackageToken,
  verifyPackageToken,
  hashContent,
  canonicalise,
} = require('../../lib/offline/package-token');
const { openDatabase } = require('../db');
const { createRepository } = require('../db/repository');
const { prepareAssessment } = require('./prepare');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tereco-net-'));
const DEVICE = 'LAB-PC-007';
const KID = 'test-key';
const BASE = 'https://tereco.example';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC_KEYS = { [KID]: publicKey.export({ type: 'spki', format: 'pem' }).toString() };

let passed = 0;
function check(name, fn) {
  const result = fn();
  const done = () => {
    passed += 1;
    console.log(`  ok  ${name}`);
  };
  return result instanceof Promise ? result.then(done) : (done(), Promise.resolve());
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function buildContent() {
  return {
    student: { id: 'stu-1', systemId: 'TST2026001', name: 'Test Learner', classLabel: 'P.6 Blue' },
    assessment: {
      id: 'ass-uuid-1',
      systemId: 'ASS0001',
      title: 'Biology Mid-Term',
      instructions: 'Answer all questions.',
      durationSeconds: 3600,
      expectedQuestionCount: 2,
    },
    questions: [
      {
        id: 'q-uuid-1',
        code: 'Q1',
        position: 0,
        questionText: 'Name the shape below.',
        questionType: 'mcq',
        options: ['Square', 'Circle'],
        imageUrl: 'https://cdn.example/shape.png',
        maxScore: 1,
      },
      {
        id: 'q-uuid-2',
        code: 'Q2',
        position: 1,
        questionText: 'Explain osmosis.',
        questionType: 'long',
        options: [],
        maxScore: 5,
      },
    ],
  };
}

function buildClaims(content, overrides = {}) {
  return {
    kid: KID,
    studentId: content.student.id,
    assessmentId: content.assessment.id,
    assessmentSystemId: content.assessment.systemId,
    startedAt: Date.now(),
    durationSeconds: content.assessment.durationSeconds,
    deviceId: DEVICE,
    validUntil: Date.now() + 60_000,
    contentHash: hashContent(content),
    ...overrides,
  };
}

/** Stands in for the network: serves the package endpoint and the CDN. */
function fakeFetch(content, claims, mutate = (payload) => payload) {
  return async (url) => {
    if (url.startsWith('https://cdn.example/')) {
      return { ok: true, status: 200, arrayBuffer: async () => PNG };
    }

    const payload = mutate({
      ...content,
      token: signPackageToken(claims, PRIVATE_PEM),
      startedAt: claims.startedAt,
      expiresAt: claims.validUntil,
    });

    return { ok: true, status: 200, json: async () => ({ success: true, data: payload }) };
  };
}

async function main() {
  console.log('\npackage signing + preparation smoke test\n');

  await check('canonical JSON is independent of key order', () => {
    assert.equal(canonicalise({ b: 1, a: 2 }), canonicalise({ a: 2, b: 1 }));
    // Absent and explicitly-undefined must hash alike: the server builds the
    // payload with optional fields undefined, and JSON drops them in transit.
    assert.equal(canonicalise({ a: 1, b: undefined }), canonicalise({ a: 1 }));
  });

  await check('a signed grant verifies and returns its claims', () => {
    const content = buildContent();
    const claims = buildClaims(content);
    const back = verifyPackageToken(signPackageToken(claims, PRIVATE_PEM), PUBLIC_KEYS);
    assert.equal(back.studentId, 'stu-1');
    assert.equal(back.deviceId, DEVICE);
  });

  await check('editing a claim invalidates the signature', () => {
    const content = buildContent();
    const token = signPackageToken(buildClaims(content), PRIVATE_PEM);
    const [header, payload, signature] = token.split('.');

    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    forged.studentId = 'stu-someone-else';
    const tampered = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`;

    assert.throws(() => verifyPackageToken(tampered, PUBLIC_KEYS), /signature is not valid/);
  });

  await check('a grant signed by another key is refused', () => {
    const other = crypto.generateKeyPairSync('ed25519');
    const otherPem = other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = signPackageToken(buildClaims(buildContent()), otherPem);
    assert.throws(() => verifyPackageToken(token, PUBLIC_KEYS), /signature is not valid/);
  });

  await check('an unknown key id names the problem instead of failing obscurely', () => {
    const claims = buildClaims(buildContent(), { kid: 'rotated-key-2027' });
    const token = signPackageToken(claims, PRIVATE_PEM);
    assert.throws(() => verifyPackageToken(token, PUBLIC_KEYS), /does not know the key/);
  });

  await check('a header pointing at a different key than it signed is refused', () => {
    const claims = buildClaims(buildContent());
    const token = signPackageToken(claims, PRIVATE_PEM);
    const [, payload, signature] = token.split('.');
    const swapped = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: 'other' })).toString('base64url');
    assert.throws(
      () => verifyPackageToken(`${swapped}.${payload}.${signature}`, PUBLIC_KEYS),
      /key id does not match/
    );
  });

  await check('an expired grant is refused', () => {
    const claims = buildClaims(buildContent(), { validUntil: Date.now() - 1 });
    const token = signPackageToken(claims, PRIVATE_PEM);
    assert.throws(() => verifyPackageToken(token, PUBLIC_KEYS), /has expired/);
  });

  // ─── Preparation, end to end ──────────────────────────────────────────────

  const dbFile = path.join(dir, 'tereco.db');
  const mediaDir = path.join(dir, 'media');
  const db = openDatabase({ file: dbFile });
  const repo = createRepository(db);

  await check('preparing writes a verified, sittable package', async () => {
    const content = buildContent();
    const claims = buildClaims(content);

    const result = await prepareAssessment({
      baseUrl: BASE,
      assessmentSystemId: 'ASS0001',
      deviceId: DEVICE,
      repo,
      mediaDir,
      publicKeys: PUBLIC_KEYS,
      fetchFn: fakeFetch(content, claims),
    });

    assert.equal(result.questionCount, 2);

    repo.setActiveStudentId('stu-1');
    const list = repo.listPrepared();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Biology Mid-Term');
  });

  await check('question media is downloaded and served from disk, not the CDN', () => {
    const questions = repo.getQuestions('ass-uuid-1');
    const withImage = questions.find((q) => q.code === 'Q1');
    assert.ok(withImage.imageUrl.startsWith(mediaDir), `expected a local path, got ${withImage.imageUrl}`);
    assert.ok(fs.existsSync(withImage.imageUrl));
    // The signed value is kept so the content hash can be re-checked later.
    assert.equal(withImage.signedImageUrl, 'https://cdn.example/shape.png');
  });

  await check('a package prepared for another computer is refused', async () => {
    const content = buildContent();
    const claims = buildClaims(content, { deviceId: 'LAB-PC-999' });
    await assert.rejects(
      prepareAssessment({
        baseUrl: BASE,
        assessmentSystemId: 'ASS0001',
        deviceId: DEVICE,
        repo,
        mediaDir,
        publicKeys: PUBLIC_KEYS,
        fetchFn: fakeFetch(content, claims),
      }),
      /prepared for a different computer/
    );
  });

  await check('altered questions are caught by the signed content hash', async () => {
    const content = buildContent();
    const claims = buildClaims(content);

    await assert.rejects(
      prepareAssessment({
        baseUrl: BASE,
        assessmentSystemId: 'ASS0001',
        deviceId: DEVICE,
        repo,
        mediaDir,
        publicKeys: PUBLIC_KEYS,
        // Something between the server and the machine rewrites a question
        // after signing. The hash is inside the signature, so there is no
        // second field to rewrite to match.
        fetchFn: fakeFetch(content, claims, (payload) => ({
          ...payload,
          questions: payload.questions.map((q) =>
            q.code === 'Q2' ? { ...q, questionText: 'Explain nothing.' } : q
          ),
        })),
      }),
      /does not match what the server signed/
    );
  });

  await check('a refused re-download does not corrupt the good package already held', () => {
    // The rejected attempt above was for the same assessment that prepared
    // successfully earlier. Verification happens before any write, so the
    // paper on the machine must be untouched rather than half-overwritten.
    assert.equal(repo.listPrepared().length, 1);
    const questions = repo.getQuestions('ass-uuid-1');
    assert.equal(questions.length, 2);
    assert.equal(questions.find((q) => q.code === 'Q2').questionText, 'Explain osmosis.');
  });

  await check("a server error message reaches the learner unchanged", async () => {
    await assert.rejects(
      prepareAssessment({
        baseUrl: BASE,
        assessmentSystemId: 'ASS0009',
        deviceId: DEVICE,
        repo,
        mediaDir,
        publicKeys: PUBLIC_KEYS,
        fetchFn: async () => ({
          ok: false,
          status: 409,
          json: async () => ({ success: false, message: 'You have already submitted this assessment.' }),
        }),
      }),
      /already submitted this assessment/
    );
  });

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passed} checks passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
