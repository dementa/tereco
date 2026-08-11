/**
 * Package signing, verification and online preparation.
 *
 * The signing half runs on the server and the verifying half on a lab machine,
 * so in production the two never execute together. This file is the only place
 * they are checked against each other — a disagreement means good packages fail
 * to verify at exam time, which is exactly when nobody can debug it.
 */

import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// CommonJS because these modules also run in the Electron main process.
const require = createRequire(import.meta.url);
const {
  signPackageToken,
  verifyPackageToken,
  hashContent,
  canonicalise,
} = require('../../lib/offline/package-token.js');
const { openDatabase } = require('../db/index.js');
const { createRepository } = require('../db/repository.js');
const { prepareAssessment } = require('./prepare.js');

const DEVICE = 'LAB-PC-007';
const KID = 'test-key';
const BASE = 'https://tereco.example';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC_KEYS = { [KID]: publicKey.export({ type: 'spki', format: 'pem' }).toString() };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let dir;
let mediaDir;
let db;
let repo;

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

/** Stands in for the network: serves both the package endpoint and the CDN. */
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

function prepare(overrides = {}) {
  return prepareAssessment({
    baseUrl: BASE,
    assessmentSystemId: 'ASS0001',
    deviceId: DEVICE,
    repo,
    mediaDir,
    publicKeys: PUBLIC_KEYS,
    ...overrides,
  });
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tereco-net-'));
  mediaDir = path.join(dir, 'media');
  db = openDatabase({ file: path.join(dir, 'tereco.db') });
  repo = createRepository(db);
});

afterAll(() => {
  db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('package token', () => {
  it('hashes independently of key order', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));

    // Absent and explicitly-undefined must hash alike: the server builds the
    // payload with optional fields undefined, and JSON drops them in transit.
    expect(canonicalise({ a: 1, b: undefined })).toBe(canonicalise({ a: 1 }));
  });

  it('round-trips a signed grant', () => {
    const claims = buildClaims(buildContent());
    const back = verifyPackageToken(signPackageToken(claims, PRIVATE_PEM), PUBLIC_KEYS);

    expect(back.studentId).toBe('stu-1');
    expect(back.deviceId).toBe(DEVICE);
  });

  it('rejects an edited claim', () => {
    const token = signPackageToken(buildClaims(buildContent()), PRIVATE_PEM);
    const [header, payload, signature] = token.split('.');

    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    forged.studentId = 'stu-someone-else';
    const tampered = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`;

    expect(() => verifyPackageToken(tampered, PUBLIC_KEYS)).toThrow(/signature is not valid/);
  });

  it('rejects a grant signed by another key', () => {
    const other = crypto.generateKeyPairSync('ed25519');
    const otherPem = other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = signPackageToken(buildClaims(buildContent()), otherPem);

    expect(() => verifyPackageToken(token, PUBLIC_KEYS)).toThrow(/signature is not valid/);
  });

  it('names an unknown key id rather than failing obscurely', () => {
    const token = signPackageToken(
      buildClaims(buildContent(), { kid: 'rotated-key-2027' }),
      PRIVATE_PEM
    );

    expect(() => verifyPackageToken(token, PUBLIC_KEYS)).toThrow(/does not know the key/);
  });

  it('rejects a header pointing at a different key than it signed', () => {
    const token = signPackageToken(buildClaims(buildContent()), PRIVATE_PEM);
    const [, payload, signature] = token.split('.');
    const swapped = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: 'other' })).toString(
      'base64url'
    );

    expect(() => verifyPackageToken(`${swapped}.${payload}.${signature}`, PUBLIC_KEYS)).toThrow(
      /key id does not match/
    );
  });

  it('rejects an expired grant', () => {
    const token = signPackageToken(
      buildClaims(buildContent(), { validUntil: Date.now() - 1 }),
      PRIVATE_PEM
    );

    expect(() => verifyPackageToken(token, PUBLIC_KEYS)).toThrow(/has expired/);
  });
});

describe('online preparation', () => {
  it('writes a verified, sittable package', async () => {
    const content = buildContent();
    const result = await prepare({ fetchFn: fakeFetch(content, buildClaims(content)) });

    expect(result.questionCount).toBe(2);

    repo.setActiveStudentId('stu-1');
    const list = repo.listPrepared();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Biology Mid-Term');
  });

  it('serves question media from disk rather than the CDN', () => {
    const withImage = repo.getQuestions('ass-uuid-1').find((q) => q.code === 'Q1');

    expect(withImage.imageUrl.startsWith(mediaDir)).toBe(true);
    expect(fs.existsSync(withImage.imageUrl)).toBe(true);
    // The signed value is kept so the content hash can be re-checked later.
    expect(withImage.signedImageUrl).toBe('https://cdn.example/shape.png');
  });

  it('refuses a package prepared for another computer', async () => {
    const content = buildContent();
    const claims = buildClaims(content, { deviceId: 'LAB-PC-999' });

    await expect(prepare({ fetchFn: fakeFetch(content, claims) })).rejects.toThrow(
      /prepared for a different computer/
    );
  });

  it('catches questions altered after signing', async () => {
    const content = buildContent();

    await expect(
      prepare({
        // Something between the server and the machine rewrites a question
        // after signing. The hash is inside the signature, so there is no
        // second field to rewrite to match.
        fetchFn: fakeFetch(content, buildClaims(content), (payload) => ({
          ...payload,
          questions: payload.questions.map((q) =>
            q.code === 'Q2' ? { ...q, questionText: 'Explain nothing.' } : q
          ),
        })),
      })
    ).rejects.toThrow(/does not match what the server signed/);
  });

  it('leaves the good package intact when a re-download is refused', () => {
    // Verification happens before any write, so the paper already on the
    // machine must be untouched rather than half-overwritten.
    expect(repo.listPrepared()).toHaveLength(1);

    const questions = repo.getQuestions('ass-uuid-1');
    expect(questions).toHaveLength(2);
    expect(questions.find((q) => q.code === 'Q2').questionText).toBe('Explain osmosis.');
  });

  it("passes the server's message through to the learner unchanged", async () => {
    await expect(
      prepare({
        fetchFn: async () => ({
          ok: false,
          status: 409,
          json: async () => ({
            success: false,
            message: 'You have already submitted this assessment.',
          }),
        }),
      })
    ).rejects.toThrow(/already submitted this assessment/);
  });
});
