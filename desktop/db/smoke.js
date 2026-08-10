'use strict';

/**
 * Lifecycle smoke test for the local database, runnable under plain Node:
 *
 *   node desktop/db/smoke.js
 *
 * This repository has no test runner (package.json is dev/build/start/lint), and
 * Electron cannot be launched from the dev container, so this script is how the
 * SQL and the repository logic get exercised at all. It does not verify the
 * Electron ABI — that still needs a real machine — but every rule that protects
 * a student's work lives in here rather than in Electron.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openDatabase } = require('./index');
const { createRepository } = require('./repository');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tereco-smoke-'));
const file = path.join(dir, 'tereco.db');
const DEVICE = 'LAB-PC-TEST';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/**
 * `questions.id` is a global primary key because Supabase question ids are
 * uuids. The fixture mirrors that by namespacing ids per assessment — reusing
 * `q1` across two papers is a shape that cannot occur in production.
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

console.log(`\nlocal database smoke test  (${file})\n`);

let db = openDatabase({ file });
let repo = createRepository(db);

check('schema applies and sets user_version', () => {
  assert.equal(db.pragma('user_version', { simple: true }), 1);
});

check('nothing is listed before a learner signs in', () => {
  assert.deepEqual(repo.listPrepared(), []);
});

check('a verified package becomes listable', () => {
  repo.savePackage(samplePackage());
  repo.setActiveStudentId('stu-1');
  const list = repo.listPrepared();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Biology Mid-Term');
  assert.equal(list[0].questionCount, 2);
});

check('an incomplete package rolls back and stays unlistable', () => {
  assert.throws(
    () => repo.savePackage(samplePackage({ assessmentId: 'ass-2', expectedQuestionCount: 40 })),
    /Package incomplete/
  );
  assert.equal(repo.getPackage('ass-2'), null);
});

check("another learner's package is not listed", () => {
  repo.savePackage(
    samplePackage({ student: { id: 'stu-2', systemId: 'TST2026002', name: 'Other Learner' } })
  );
  const list = repo.listPrepared();
  assert.equal(list.length, 1);
  assert.equal(list[0].assessmentId, 'ass-1');
});

let attemptId;

check('entering the paper creates one attempt with the full clock', () => {
  const attempt = repo.getAttempt('ass-1', DEVICE);
  attemptId = attempt.attemptId;
  assert.equal(attempt.status, 'in_progress');
  assert.equal(attempt.currentIndex, 0);
  assert.deepEqual(attempt.answers, {});
  assert.ok(attempt.remainingSeconds > 3590, `expected ~3600, got ${attempt.remainingSeconds}`);
});

check('re-entering resumes the same attempt, not a new clock', () => {
  const again = repo.getAttempt('ass-1', DEVICE);
  assert.equal(again.attemptId, attemptId);
});

check('answers persist and can be changed', () => {
  repo.saveAnswer(attemptId, 'ass-1-q1', 'A');
  repo.saveAnswer(attemptId, 'ass-1-q2', 'first draft');
  repo.saveAnswer(attemptId, 'ass-1-q2', 'second draft');
  repo.saveIndex(attemptId, 1);

  const state = repo.getAttempt('ass-1', DEVICE);
  assert.deepEqual(state.answers, { 'ass-1-q1': 'A', 'ass-1-q2': 'second draft' });
  assert.equal(state.currentIndex, 1);
});

check('answers survive closing and reopening the database', () => {
  db.close();
  db = openDatabase({ file });
  repo = createRepository(db);

  const state = repo.getAttempt('ass-1', DEVICE);
  assert.equal(state.attemptId, attemptId);
  assert.deepEqual(state.answers, { 'ass-1-q1': 'A', 'ass-1-q2': 'second draft' });
});

check('winding the system clock back does not buy more time', () => {
  const before = repo.getAttempt('ass-1', DEVICE).remainingSeconds;

  // Simulates the clock having already been seen 10 minutes further on, which
  // is what the floor records. Elapsed time is measured against the floor, so
  // the remaining time must drop, never recover.
  db.prepare('update attempts set clock_floor = ? where id = ?').run(
    Date.now() + 600_000,
    attemptId
  );

  const after = repo.getAttempt('ass-1', DEVICE).remainingSeconds;
  assert.ok(after <= before - 590, `expected ~600s less, got ${before} -> ${after}`);
});

check('submitting queues the work locally', () => {
  assert.deepEqual(repo.submit(attemptId), { queued: true });
  const status = repo.syncStatus();
  assert.equal(status.pending, 1);
});

check('answers cannot be changed after submission', () => {
  assert.throws(() => repo.saveAnswer(attemptId, 'ass-1-q1', 'B'), /already been submitted/);
});

check('submitting twice does not duplicate the queued work', () => {
  // The second tap throws because the attempt is closed, and crucially the
  // queue still holds exactly one row for it.
  assert.throws(() => repo.submit(attemptId), /already been submitted/);
  const rows = db
    .prepare('select count(*) as n from sync_queue where attempt_id = ?')
    .get(attemptId);
  assert.equal(rows.n, 1);
});

check('an unreadable database is reported, never silently replaced', () => {
  const corrupt = path.join(dir, 'corrupt.db');
  fs.writeFileSync(corrupt, 'this is not a sqlite file at all');
  assert.throws(() => openDatabase({ file: corrupt }), /could not be opened/);
  // The file must still be there for recovery.
  assert.ok(fs.existsSync(corrupt));
});

db.close();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} checks passed\n`);
