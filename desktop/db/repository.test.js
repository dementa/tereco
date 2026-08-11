/**
 * Lifecycle of the local assessment database.
 *
 * Ordered on purpose: the checks walk one learner through preparing, sitting,
 * resuming after a crash and submitting, because that sequence IS the thing
 * being tested. Each `it` builds on the last.
 *
 * Every rule that protects a student's work lives here rather than in Electron,
 * which is why this runs under plain Node and does not need a real machine.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The db layer is CommonJS because it also runs in the Electron main process,
// which has no TypeScript and no ESM build step. createRequire loads it as the
// CJS it is, rather than letting Vite transform it into something else.
const require = createRequire(import.meta.url);
const { openDatabase, schemaVersion } = require('./index.js');
const { createRepository } = require('./repository.js');

const DEVICE = 'LAB-PC-TEST';

let dir;
let file;
let db;
let repo;

/**
 * `questions.id` is a global primary key because Supabase question ids are
 * uuids. Ids are namespaced per assessment to match — reusing `q1` across two
 * papers is a shape that cannot occur in production.
 */
function samplePackage({ assessmentId = 'ass-1', expectedQuestionCount = 2, ...overrides } = {}) {
  return {
    student: { id: 'stu-1', systemId: 'TST2026001', name: 'Test Learner', classLabel: 'S3' },
    assessment: {
      id: assessmentId,
      title: 'Biology Mid-Term',
      instructions: 'Answer all questions.',
      durationSeconds: 3600,
      expectedQuestionCount,
      config: { shuffle: false },
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
      {
        id: `${assessmentId}-q2`,
        position: 1,
        code: 'Q2',
        questionText: 'Explain osmosis.',
        questionType: 'long',
      },
    ],
    token: 'signed.token.placeholder',
    checksum: 'sha256-placeholder',
    ...overrides,
  };
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tereco-db-'));
  file = path.join(dir, 'tereco.db');
  db = openDatabase({ file });
  repo = createRepository(db);
});

afterAll(() => {
  db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('local assessment database', () => {
  let attemptId;

  it('applies every migration and lands user_version on the latest', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(schemaVersion());
  });

  it('lists nothing before a learner signs in', () => {
    expect(repo.listPrepared()).toEqual([]);
  });

  it('makes a verified package listable', () => {
    repo.savePackage(samplePackage());
    repo.setActiveStudentId('stu-1');

    const list = repo.listPrepared();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Biology Mid-Term');
    expect(list[0].questionCount).toBe(2);
  });

  it('rolls back an incomplete package so it can never be sat', () => {
    expect(() =>
      repo.savePackage(samplePackage({ assessmentId: 'ass-2', expectedQuestionCount: 40 }))
    ).toThrow(/Package incomplete/);

    expect(repo.getPackage('ass-2')).toBeNull();
  });

  it("does not list another learner's package on a shared machine", () => {
    repo.savePackage(
      samplePackage({ student: { id: 'stu-2', systemId: 'TST2026002', name: 'Other Learner' } })
    );

    const list = repo.listPrepared();
    expect(list).toHaveLength(1);
    expect(list[0].assessmentId).toBe('ass-1');
  });

  it('creates one attempt with the full clock on first entry', () => {
    const attempt = repo.getAttempt('ass-1', DEVICE);
    attemptId = attempt.attemptId;

    expect(attempt.status).toBe('in_progress');
    expect(attempt.currentIndex).toBe(0);
    expect(attempt.answers).toEqual({});
    expect(attempt.remainingSeconds).toBeGreaterThan(3590);
  });

  it('resumes the same attempt rather than granting a fresh clock', () => {
    expect(repo.getAttempt('ass-1', DEVICE).attemptId).toBe(attemptId);
  });

  it('persists answers and lets the learner change their mind', () => {
    repo.saveAnswer(attemptId, 'ass-1-q1', 'A');
    repo.saveAnswer(attemptId, 'ass-1-q2', 'first draft');
    repo.saveAnswer(attemptId, 'ass-1-q2', 'second draft');
    repo.saveIndex(attemptId, 1);

    const state = repo.getAttempt('ass-1', DEVICE);
    expect(state.answers).toEqual({ 'ass-1-q1': 'A', 'ass-1-q2': 'second draft' });
    expect(state.currentIndex).toBe(1);
  });

  it('survives the application closing and reopening', () => {
    db.close();
    db = openDatabase({ file });
    repo = createRepository(db);

    const state = repo.getAttempt('ass-1', DEVICE);
    expect(state.attemptId).toBe(attemptId);
    expect(state.answers).toEqual({ 'ass-1-q1': 'A', 'ass-1-q2': 'second draft' });
  });

  it('gives no extra time when the system clock is wound back', () => {
    const before = repo.getAttempt('ass-1', DEVICE).remainingSeconds;

    // Simulates the clock already having been seen ten minutes further on,
    // which is what the floor records. Elapsed time is measured against the
    // floor, so remaining time must drop rather than recover.
    db.prepare('update attempts set clock_floor = ? where id = ?').run(
      Date.now() + 600_000,
      attemptId
    );

    expect(repo.getAttempt('ass-1', DEVICE).remainingSeconds).toBeLessThanOrEqual(before - 590);
  });

  it('queues the work locally on submit, with no network', () => {
    expect(repo.submit(attemptId)).toEqual({ queued: true });
    expect(repo.syncStatus().pending).toBe(1);
  });

  it('refuses to change answers after submission', () => {
    expect(() => repo.saveAnswer(attemptId, 'ass-1-q1', 'B')).toThrow(/already been submitted/);
  });

  it('does not duplicate queued work when Submit is tapped twice', () => {
    expect(() => repo.submit(attemptId)).toThrow(/already been submitted/);

    const { n } = db
      .prepare('select count(*) as n from sync_queue where attempt_id = ?')
      .get(attemptId);
    expect(n).toBe(1);
  });

  it('reports an unreadable database instead of silently replacing it', () => {
    const corrupt = path.join(dir, 'corrupt.db');
    fs.writeFileSync(corrupt, 'this is not a sqlite file at all');

    expect(() => openDatabase({ file: corrupt })).toThrow(/could not be opened/);

    // The file must survive for recovery: it may hold a room's unsent papers.
    expect(fs.existsSync(corrupt)).toBe(true);
  });
});
