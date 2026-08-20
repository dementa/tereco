/**
 * Draining the sync queue.
 *
 * The invariant under test throughout: a submission is marked synced only when
 * the server has confirmed it, and nothing else — not a status code, not a
 * retry, not a timeout — ever loses or duplicates a learner's work.
 */

import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { signPackageToken, hashContent } = require('../../lib/offline/package-token.js');
const { openDatabase } = require('../db/index.js');
const { createRepository } = require('../db/repository.js');
const { createSyncEngine } = require('./sync.js');

const DEVICE = 'LAB-PC-011';
const KID = 'test-key';
const BASE = 'https://tereco.example';

const { privateKey } = crypto.generateKeyPairSync('ed25519');
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

let dir;
let db;
let repo;

function seedSubmittedAttempt({ assessmentId = 'ass-1', studentId = 'stu-1' } = {}) {
  const content = { assessment: { id: assessmentId }, questions: [] };
  const token = signPackageToken(
    {
      kid: KID,
      studentId,
      assessmentId,
      assessmentSystemId: 'ASS0001',
      startedAt: Date.now() - 600_000,
      durationSeconds: 3600,
      deviceId: DEVICE,
      validUntil: Date.now() + 86_400_000,
      contentHash: hashContent(content),
    },
    PRIVATE_PEM
  );

  repo.savePackage({
    student: { id: studentId, systemId: 'TST1', name: 'Test Learner' },
    assessment: {
      id: assessmentId,
      title: 'Biology Mid-Term',
      durationSeconds: 3600,
      expectedQuestionCount: 1,
    },
    questions: [
      {
        id: `${assessmentId}-q1`,
        position: 0,
        code: 'Q1',
        questionText: 'Name the organelle.',
        questionType: 'mcq',
        options: ['A', 'B'],
      },
    ],
    token,
    checksum: 'sha256-placeholder',
  });

  repo.setActiveStudentId(studentId);
  const attempt = repo.getAttempt(assessmentId, DEVICE);
  repo.saveAnswer(attempt.attemptId, `${assessmentId}-q1`, 'A');
  repo.submit(attempt.attemptId);
  return attempt.attemptId;
}

function engineWith(fetchFn, now) {
  return createSyncEngine({ baseUrl: BASE, repo, fetchFn, ...(now ? { now } : {}) });
}

function ok(body = { success: true, message: 'Assessment synchronised' }) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tereco-sync-'));
  db = openDatabase({ file: path.join(dir, 'tereco.db') });
  repo = createRepository(db);
});

afterEach(() => {
  db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('sync engine', () => {
  it('uploads queued work and marks it synced', async () => {
    seedSubmittedAttempt();
    const fetchFn = vi.fn(async () => ok());

    const result = await engineWith(fetchFn).drain();

    expect(result.synced).toBe(1);
    expect(result.pending).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://tereco.example/api/sync/submission');
    const body = JSON.parse(init.body);
    expect(body.deviceId).toBe(DEVICE);
    expect(body.answers).toEqual({ 'ass-1-q1': 'A' });
    expect(body.token).toBeTruthy();
  });

  it('sends nothing a second time once it has synced', async () => {
    seedSubmittedAttempt();
    const fetchFn = vi.fn(async () => ok());

    await engineWith(fetchFn).drain();
    const second = await engineWith(fetchFn).drain();

    expect(second.synced).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("treats the server's already-synchronised answer as success", async () => {
    seedSubmittedAttempt();
    // The ordinary retry case: the write landed but the response was lost, so
    // the device asks again and the unique constraint reports the collision.
    const fetchFn = vi.fn(async () =>
      ok({ success: true, alreadySynced: true, message: 'This assessment was already synchronised.' })
    );

    const result = await engineWith(fetchFn).drain();

    expect(result.synced).toBe(1);
    expect(result.pending).toBe(0);
  });

  it('keeps the work and stays retryable when the network is down', async () => {
    const attemptId = seedSubmittedAttempt();
    const failing = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    const result = await engineWith(failing).drain();

    expect(result.synced).toBe(0);
    expect(result.pending).toBe(1);

    // The answers must still be on the machine.
    const answers = db
      .prepare('select count(*) as n from answers where attempt_id = ?')
      .get(attemptId);
    expect(answers.n).toBe(1);

    const queued = db.prepare('select * from sync_queue where attempt_id = ?').get(attemptId);
    expect(queued.status).toBe('failed');
    expect(queued.retry_count).toBe(1);
    expect(queued.synced_at).toBeNull();
  });

  it('succeeds on a later attempt once the network returns', async () => {
    seedSubmittedAttempt();
    let online = false;
    const fetchFn = vi.fn(async () => {
      if (!online) throw new TypeError('fetch failed');
      return ok();
    });

    // Time is injected so the backoff window can be crossed without waiting.
    let clock = Date.now();
    const engine = engineWith(fetchFn, () => clock);

    await engine.drain();
    online = true;
    clock += 60_000;

    const result = await engine.drain();
    expect(result.synced).toBe(1);
    expect(result.pending).toBe(0);
  });

  it('does not retry an item that is still inside its backoff window', async () => {
    seedSubmittedAttempt();
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    let clock = Date.now();
    const engine = engineWith(fetchFn, () => clock);

    await engine.drain();
    // Immediately again: the first failure earns a five second wait, so this
    // pass must find nothing to do rather than hammering a failing link.
    await engine.drain();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a forced drain retries an item still inside its backoff window', async () => {
    seedSubmittedAttempt();
    let online = false;
    const fetchFn = vi.fn(async () => {
      if (!online) throw new TypeError('fetch failed');
      return ok();
    });

    let clock = Date.now();
    const engine = engineWith(fetchFn, () => clock);

    await engine.drain();
    // Same instant: the plain "Sync now" button, or the network coming back,
    // must not be silently swallowed by the five second cooldown the first
    // failure just earned.
    online = true;
    const result = await engine.drain({ force: true });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.synced).toBe(1);
    expect(result.pending).toBe(0);
  });

  it('refuses to call work synced on a 200 that does not confirm it', async () => {
    seedSubmittedAttempt();
    // A captive portal or proxy error page: HTTP says fine, the body does not.
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ notOurShape: true }),
    }));

    const result = await engineWith(fetchFn).drain();

    expect(result.synced).toBe(0);
    expect(result.pending).toBe(1);
  });

  it('stops retrying a submission the server will never accept', async () => {
    seedSubmittedAttempt();
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ success: false, message: 'Package signature is not valid.' }),
    }));

    const result = await engineWith(fetchFn).drain();

    expect(result.synced).toBe(0);
    // Still on the machine and still visible, just not consuming attempts.
    expect(result.pending).toBe(1);
    expect(result.lastError).toMatch(/signature is not valid/);
  });

  it('uploads several papers oldest first', async () => {
    seedSubmittedAttempt({ assessmentId: 'ass-1' });
    seedSubmittedAttempt({ assessmentId: 'ass-2' });

    const seen = [];
    const fetchFn = vi.fn(async (_url, init) => {
      seen.push(JSON.parse(init.body).answers);
      return ok();
    });

    const result = await engineWith(fetchFn).drain();

    expect(result.synced).toBe(2);
    expect(seen).toEqual([{ 'ass-1-q1': 'A' }, { 'ass-2-q1': 'A' }]);
  });
});
