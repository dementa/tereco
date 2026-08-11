/**
 * The Definition of Done from issue #33, walked end to end in one test.
 *
 *   internet on  -> download -> "ready"
 *   internet OFF -> sit the paper -> app restarts -> submit
 *   internet on  -> syncs -> the server holds EXACTLY ONE submission
 *
 * Every unit is covered elsewhere. This is the one that proves they fit
 * together, because each of the bugs this feature has already produced lived in
 * a seam rather than a part: a package written before the row it referenced, an
 * optimistic cache that marked failed writes as saved, a backoff that re-queued
 * work it had never attempted.
 *
 * Nothing here is mocked except the HTTP layer, and that is implemented to
 * match what the real routes do — including the unique(assessment_id,
 * student_id) collision that makes a retry idempotent. Signing, verification,
 * the SQLite schema, the repository, the download and the sync engine are all
 * the real code.
 */

import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { signPackageToken, hashContent, verifyPackageToken } = require('../lib/offline/package-token.js');
const { openDatabase } = require('./db/index.js');
const { createRepository } = require('./db/repository.js');
const { prepareAssessment } = require('./net/prepare.js');
const { createSyncEngine } = require('./net/sync.js');

const DEVICE = 'LAB-PC-014';
const KID = 'e2e-key';
const BASE = 'https://tereco.example';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC_KEYS = { [KID]: publicKey.export({ type: 'spki', format: 'pem' }).toString() };

const PAPER = {
  student: { id: 'stu-7', systemId: 'TST2026007', name: 'Aine Mukisa', classLabel: 'P.6 Blue' },
  assessment: {
    id: 'ass-uuid-7',
    systemId: 'ASS0007',
    title: 'Biology Mid-Term',
    instructions: 'Answer all questions.',
    durationSeconds: 3600,
    expectedQuestionCount: 2,
  },
  questions: [
    {
      id: 'q-a',
      code: 'Q1',
      position: 0,
      questionText: 'Name the organelle.',
      questionType: 'mcq',
      options: ['Nucleus', 'Mitochondrion'],
      maxScore: 1,
    },
    {
      id: 'q-b',
      code: 'Q2',
      position: 1,
      questionText: 'Explain osmosis.',
      questionType: 'long',
      options: [],
      maxScore: 5,
    },
  ],
};

/**
 * Stands in for the deployment.
 *
 * `submissions` enforces the same uniqueness the database does, because that
 * constraint is the whole idempotency story: a retry must collide and be
 * reported as success rather than creating a second row.
 */
function createServer() {
  const state = { submissions: [], online: true, requests: 0 };

  const fetchFn = async (url, init = {}) => {
    state.requests += 1;
    if (!state.online) throw new TypeError('fetch failed');

    if (url.includes('/package')) {
      const startedAt = Date.now() - 5_000;
      const claims = {
        kid: KID,
        studentId: PAPER.student.id,
        assessmentId: PAPER.assessment.id,
        assessmentSystemId: PAPER.assessment.systemId,
        startedAt,
        durationSeconds: PAPER.assessment.durationSeconds,
        deviceId: DEVICE,
        validUntil: Date.now() + 14 * 24 * 3600 * 1000,
        contentHash: hashContent(PAPER),
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            ...PAPER,
            token: signPackageToken(claims, PRIVATE_PEM),
            startedAt,
            expiresAt: claims.validUntil,
          },
        }),
      };
    }

    if (url.includes('/api/sync/submission')) {
      const body = JSON.parse(init.body);

      // The real route takes identity from the verified grant, never the body.
      const claims = verifyPackageToken(body.token, PUBLIC_KEYS);
      if (claims.deviceId !== body.deviceId) {
        return { ok: false, status: 403, json: async () => ({ success: false, message: 'Wrong device.' }) };
      }

      const key = `${claims.assessmentId}:${claims.studentId}`;
      if (state.submissions.some((s) => s.key === key)) {
        // unique(assessment_id, student_id) collided. First write wins, and the
        // retry is success — the work did land.
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, alreadySynced: true }),
        };
      }

      state.submissions.push({ key, answers: body.answers, timeSpentSeconds: body.timeSpentSeconds });
      return { ok: true, status: 200, json: async () => ({ success: true, alreadySynced: false }) };
    }

    throw new Error(`unexpected request: ${url}`);
  };

  return { state, fetchFn };
}

let dir;
let dbFile;
let db;
let repo;
let server;

/** Simulates the app closing and reopening: a new connection to the same file. */
function restartApp() {
  db.close();
  db = openDatabase({ file: dbFile });
  repo = createRepository(db);
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tereco-e2e-'));
  dbFile = path.join(dir, 'tereco.db');
  db = openDatabase({ file: dbFile });
  repo = createRepository(db);
  server = createServer();
});

afterAll(() => {
  db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a paper sat with the internet switched off', () => {
  let attemptId;

  it('downloads and verifies the package while the internet is on', async () => {
    const result = await prepareAssessment({
      baseUrl: BASE,
      assessmentSystemId: 'ASS0007',
      deviceId: DEVICE,
      repo,
      mediaDir: path.join(dir, 'media'),
      publicKeys: PUBLIC_KEYS,
      fetchFn: server.fetchFn,
    });

    expect(result.questionCount).toBe(2);

    repo.setActiveStudentId(PAPER.student.id);
    expect(repo.listPrepared()).toHaveLength(1);
  });

  it('opens the paper with no network at all', () => {
    server.state.online = false;
    const before = server.state.requests;

    const attempt = repo.getAttempt(PAPER.assessment.id, DEVICE);
    attemptId = attempt.attemptId;
    const questions = repo.getQuestions(PAPER.assessment.id);

    expect(questions).toHaveLength(2);
    expect(attempt.remainingSeconds).toBeGreaterThan(3500);
    // The whole point: sitting the paper touches the network zero times.
    expect(server.state.requests).toBe(before);
  });

  it('saves answers as the learner works', () => {
    repo.saveAnswer(attemptId, 'q-a', 'Mitochondrion');
    repo.saveAnswer(attemptId, 'q-b', 'Osmosis is diffusion of water.');
    repo.saveIndex(attemptId, 1);

    expect(repo.getAttempt(PAPER.assessment.id, DEVICE).answers).toEqual({
      'q-a': 'Mitochondrion',
      'q-b': 'Osmosis is diffusion of water.',
    });
  });

  it('survives the application closing and reopening, still offline', () => {
    restartApp();

    const resumed = repo.getAttempt(PAPER.assessment.id, DEVICE);
    expect(resumed.attemptId).toBe(attemptId);
    expect(resumed.currentIndex).toBe(1);
    expect(resumed.answers['q-a']).toBe('Mitochondrion');
    // Resumed, not restarted: the clock did not go back to full.
    expect(resumed.remainingSeconds).toBeLessThan(3600);
  });

  it('submits with no network and reports the work safe locally', () => {
    expect(repo.submit(attemptId)).toEqual({ queued: true });

    const status = repo.syncStatus();
    expect(status.pending).toBe(1);
    expect(server.state.submissions).toHaveLength(0);
  });

  it('keeps the work when a sync is attempted while still offline', async () => {
    const engine = createSyncEngine({ baseUrl: BASE, repo, fetchFn: server.fetchFn });
    const result = await engine.drain();

    expect(result.synced).toBe(0);
    expect(result.pending).toBe(1);

    // Nothing was destroyed by the failure.
    const { n } = db.prepare('select count(*) as n from answers where attempt_id = ?').get(attemptId);
    expect(n).toBe(2);
  });

  it('uploads once the internet comes back', async () => {
    server.state.online = true;
    restartApp();

    let clock = Date.now() + 60_000; // past the backoff from the failed attempt
    const engine = createSyncEngine({ baseUrl: BASE, repo, fetchFn: server.fetchFn, now: () => clock });

    const result = await engine.drain();

    expect(result.synced).toBe(1);
    expect(result.pending).toBe(0);
    expect(repo.syncStatus().state).toBe('complete');
  });

  it('leaves the server holding exactly one submission', () => {
    expect(server.state.submissions).toHaveLength(1);
    expect(server.state.submissions[0].answers).toEqual({
      'q-a': 'Mitochondrion',
      'q-b': 'Osmosis is diffusion of water.',
    });
  });

  it('does not duplicate when the machine syncs again', async () => {
    let clock = Date.now() + 3_600_000;
    const engine = createSyncEngine({ baseUrl: BASE, repo, fetchFn: server.fetchFn, now: () => clock });

    await engine.drain();
    await engine.drain();

    expect(server.state.submissions).toHaveLength(1);
  });

  it('still holds the learner’s work locally after syncing', () => {
    // Nothing is deleted on success. Disk is cheap; a lab technician being able
    // to prove a paper existed is not.
    const { n } = db.prepare('select count(*) as n from answers where attempt_id = ?').get(attemptId);
    expect(n).toBe(2);
  });
});
