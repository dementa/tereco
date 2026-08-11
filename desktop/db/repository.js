'use strict';

const crypto = require('crypto');

/**
 * Everything the renderer can reach, expressed as plain functions over the
 * database. The IPC handlers in main.js are thin wrappers around these.
 *
 * Two rules hold throughout:
 *
 *  1. The renderer never supplies identity or time. `student_id` comes from the
 *     active session, `started_at` from the signed package. A function that
 *     accepted either from the page would let a student sit as someone else or
 *     award themselves more time by editing a request.
 *
 *  2. Writes commit before the call returns. better-sqlite3 is synchronous and
 *     the connection runs `synchronous = FULL`, so once `saveAnswer` returns,
 *     the answer has been fsynced. A power cut can lose the keystroke in
 *     progress and nothing already saved.
 */
function createRepository(db) {
  // ─── Session ──────────────────────────────────────────────────────────────
  // Which learner is signed in on this machine right now. Written during online
  // preparation and cleared at sign-out. In Phase 5 this becomes a claim read
  // out of the verified token rather than a bare value in app_metadata.

  const readMeta = db.prepare('select value from app_metadata where key = ?');
  const writeMeta = db.prepare(
    'insert into app_metadata (key, value) values (?, ?) ' +
      'on conflict(key) do update set value = excluded.value'
  );
  const deleteMeta = db.prepare('delete from app_metadata where key = ?');

  function getActiveStudentId() {
    return readMeta.get('active_student_id')?.value ?? null;
  }

  function setActiveStudentId(studentId) {
    if (studentId === null) deleteMeta.run('active_student_id');
    else writeMeta.run('active_student_id', studentId);
  }

  const selectStudent = db.prepare('select * from students where id = ?');

  /**
   * The signed-in learner, read from local storage rather than the network.
   *
   * This is what lets a paper survive the cable coming out. The web app
   * rehydrates its session from `/api/auth/me` on every page load; offline that
   * call fails, the app concludes nobody is signed in, and the learner is
   * bounced out of the paper they are sitting. The identity was written here
   * during online preparation, so it is still available with no network.
   *
   * Deliberately NOT proof of anything. It says who last signed in on this
   * machine, which is enough to render a name and scope a query. Authorisation
   * to sit a paper comes from the signed package and nothing else.
   */
  function getActiveStudent() {
    const studentId = getActiveStudentId();
    if (!studentId) return null;

    const row = selectStudent.get(studentId);
    if (!row) return null;

    return {
      id: row.id,
      staffId: row.system_id ?? '',
      name: row.name,
      role: 'student',
      school: '',
      className: row.class_label ?? null,
    };
  }

  // ─── Clock ────────────────────────────────────────────────────────────────

  /**
   * The current time, floored by the highest value this attempt has ever seen.
   *
   * A student who sets the system clock back gains nothing: elapsed time is
   * measured from `started_at` to this floor, and the floor only moves forward.
   * The cost of the trick is that it never runs backwards, which is exactly the
   * property wanted.
   */
  function flooredNow(attempt) {
    return Math.max(Date.now(), attempt.clock_floor);
  }

  const bumpFloor = db.prepare('update attempts set clock_floor = ? where id = ?');

  function advanceFloor(attempt) {
    const now = flooredNow(attempt);
    if (now > attempt.clock_floor) {
      bumpFloor.run(now, attempt.id);
      attempt.clock_floor = now;
    }
    return now;
  }

  function remainingSeconds(attempt, durationSeconds) {
    const elapsed = Math.floor((advanceFloor(attempt) - attempt.started_at) / 1000);
    return Math.max(0, durationSeconds - elapsed);
  }

  // ─── Prepared assessments ─────────────────────────────────────────────────

  const selectPrepared = db.prepare(`
    select a.id            as assessmentId,
           a.title         as title,
           a.duration_seconds as durationSeconds,
           a.question_count   as questionCount,
           p.prepared_at   as preparedAt,
           t.started_at    as startedAt
      from packages p
      join assessments a on a.id = p.assessment_id
      left join attempts t
             on t.assessment_id = p.assessment_id
            and t.student_id = p.student_id
     where p.student_id = ?
       and p.status = 'ready'
       and (p.expires_at is null or p.expires_at > ?)
     order by p.prepared_at desc
  `);

  /**
   * Only 'ready' packages, and only for the signed-in learner.
   *
   * The status filter is what stops a half-downloaded package being sat, and
   * the student filter is what stops the next learner at a shared desk seeing
   * the previous one's paper listed.
   */
  function listPrepared() {
    const studentId = getActiveStudentId();
    if (!studentId) return [];

    return selectPrepared.all(studentId, Date.now()).map((row) => ({
      assessmentId: row.assessmentId,
      title: row.title,
      durationSeconds: row.durationSeconds,
      // Not yet started: report the package time so the renderer has something
      // coherent to show before an attempt exists.
      startedAt: row.startedAt ?? row.preparedAt,
      questionCount: row.questionCount,
    }));
  }

  function getPackage(assessmentId) {
    return listPrepared().find((item) => item.assessmentId === assessmentId) ?? null;
  }

  const selectQuestions = db.prepare(`
    select id, position, code, question_text, question_type,
           options_json, image_url, media_path, max_score, config_json
      from questions
     where assessment_id = ?
     order by position
  `);

  /** The paper itself, shaped the way the take screen expects it. */
  function getQuestions(assessmentId) {
    if (!getPackage(assessmentId)) {
      throw new Error('No prepared assessment on this computer for the signed-in learner.');
    }

    return selectQuestions.all(assessmentId).map((row) => ({
      id: row.id,
      position: row.position,
      code: row.code,
      questionText: row.question_text,
      questionType: row.question_type,
      options: row.options_json ? JSON.parse(row.options_json) : [],
      // The local copy when it was downloaded, the signed URL otherwise. The
      // renderer must never reach the network, so a question whose media never
      // arrived shows as missing rather than silently trying Cloudinary.
      imageUrl: row.media_path ?? row.image_url ?? undefined,
      /** The value the server signed. Kept for re-verification. */
      signedImageUrl: row.image_url ?? undefined,
      maxScore: row.max_score ?? undefined,
      config: row.config_json ? JSON.parse(row.config_json) : undefined,
    }));
  }

  // ─── Attempts ─────────────────────────────────────────────────────────────

  const selectAttempt = db.prepare(
    'select * from attempts where assessment_id = ? and student_id = ?'
  );
  const selectAttemptById = db.prepare('select * from attempts where id = ?');
  const selectPackageRow = db.prepare(
    'select * from packages where assessment_id = ? and student_id = ?'
  );
  const selectDuration = db.prepare('select duration_seconds from assessments where id = ?');
  const insertAttempt = db.prepare(`
    insert into attempts
      (id, assessment_id, student_id, device_id, started_at, clock_floor, current_index, status)
    values (?, ?, ?, ?, ?, ?, 0, 'in_progress')
  `);
  const selectAnswers = db.prepare('select question_id, value from answers where attempt_id = ?');

  /**
   * Resumes the learner's attempt, creating it on first entry.
   *
   * There is exactly one attempt per (assessment, student) — the unique
   * constraint mirrors the server's — so reopening the app after a crash lands
   * on the same row, with the same `started_at`. A restart therefore resumes
   * the clock rather than granting a fresh one, which was the other half of the
   * cheat this design closes.
   *
   * @param {string} assessmentId
   * @param {string} deviceId
   * @param {number} [startedAt] epoch ms from the signed token; defaults to now
   *                             on first entry only.
   */
  function getAttempt(assessmentId, deviceId, startedAt) {
    const studentId = getActiveStudentId();
    if (!studentId) throw new Error('No learner is signed in on this computer.');

    const grant = selectPackageRow.get(assessmentId, studentId);
    if (!grant || grant.status !== 'ready') {
      throw new Error('This assessment has not been prepared for the signed-in learner.');
    }

    let attempt = selectAttempt.get(assessmentId, studentId);
    if (!attempt) {
      const begin = startedAt ?? Date.now();
      const id = crypto.randomUUID();
      insertAttempt.run(id, assessmentId, studentId, deviceId, begin, begin);
      attempt = selectAttemptById.get(id);
    }

    const { duration_seconds: durationSeconds } = selectDuration.get(assessmentId);

    const answers = {};
    for (const row of selectAnswers.all(attempt.id)) answers[row.question_id] = row.value;

    return {
      attemptId: attempt.id,
      assessmentId: attempt.assessment_id,
      answers,
      currentIndex: attempt.current_index,
      status: attempt.status,
      remainingSeconds: remainingSeconds(attempt, durationSeconds),
    };
  }

  function requireOpenAttempt(attemptId) {
    const attempt = selectAttemptById.get(attemptId);
    if (!attempt) throw new Error('Unknown attempt.');

    // #33 security: answers must not change after submission. Enforced here
    // rather than in the renderer, because the renderer is the thing being
    // defended against.
    if (attempt.status === 'submitted') {
      throw new Error('This assessment has already been submitted and can no longer be changed.');
    }

    if (attempt.student_id !== getActiveStudentId()) {
      throw new Error('This attempt belongs to a different learner.');
    }

    return attempt;
  }

  const upsertAnswer = db.prepare(`
    insert into answers (attempt_id, question_id, value, updated_at)
    values (?, ?, ?, ?)
    on conflict(attempt_id, question_id)
      do update set value = excluded.value, updated_at = excluded.updated_at
  `);
  const updateIndex = db.prepare('update attempts set current_index = ? where id = ?');

  function saveAnswer(attemptId, questionId, value) {
    const attempt = requireOpenAttempt(attemptId);
    const now = advanceFloor(attempt);
    upsertAnswer.run(attemptId, questionId, value, now);
  }

  function saveIndex(attemptId, currentIndex) {
    const attempt = requireOpenAttempt(attemptId);
    advanceFloor(attempt);
    updateIndex.run(currentIndex, attemptId);
  }

  // ─── Submission ───────────────────────────────────────────────────────────

  const markSubmitted = db.prepare(
    "update attempts set status = 'submitted', submitted_at = ? where id = ?"
  );
  const enqueue = db.prepare(`
    insert into sync_queue (attempt_id, operation, status, retry_count, created_at)
    values (?, 'submission', 'pending', 0, ?)
    on conflict(attempt_id, operation) do nothing
  `);

  /**
   * Submits locally. No network, by design.
   *
   * The attempt is marked submitted and queued in the same transaction, so
   * there is no instant where a paper is finished but unqueued. `do nothing` on
   * the conflict makes a double-tap on Submit a no-op instead of an error the
   * student would read as failure.
   */
  const submit = db.transaction((attemptId) => {
    const attempt = requireOpenAttempt(attemptId);
    const now = advanceFloor(attempt);
    markSubmitted.run(now, attemptId);
    enqueue.run(attemptId, now);
    return { queued: true };
  });

  // ─── Preparation (written by the Phase 2 download) ────────────────────────

  const upsertStudent = db.prepare(`
    insert into students (id, system_id, name, class_label) values (?, ?, ?, ?)
    on conflict(id) do update set
      system_id = excluded.system_id, name = excluded.name, class_label = excluded.class_label
  `);
  const upsertAssessment = db.prepare(`
    insert into assessments
      (id, title, instructions, duration_seconds, config_json, question_count, checksum, downloaded_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      title = excluded.title, instructions = excluded.instructions,
      duration_seconds = excluded.duration_seconds, config_json = excluded.config_json,
      question_count = excluded.question_count, checksum = excluded.checksum,
      downloaded_at = excluded.downloaded_at
  `);
  const clearQuestions = db.prepare('delete from questions where assessment_id = ?');
  const insertQuestion = db.prepare(`
    insert into questions
      (id, assessment_id, position, code, question_text, question_type,
       options_json, image_url, media_path, max_score, config_json)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertPackage = db.prepare(`
    insert into packages (assessment_id, student_id, token, status, prepared_at, expires_at)
    values (?, ?, ?, ?, ?, ?)
    on conflict(assessment_id, student_id) do update set
      token = excluded.token, status = excluded.status,
      prepared_at = excluded.prepared_at, expires_at = excluded.expires_at
  `);

  /**
   * Writes a downloaded package.
   *
   * One transaction, and the package is marked 'ready' only at the end, after
   * the question count has been checked against what the manifest promised. A
   * download cut off midway therefore leaves nothing listable rather than a
   * paper that is missing its last ten questions — which a student would not
   * notice until it was too late to fix.
   */
  const savePackage = db.transaction((payload) => {
    const { student, assessment, questions, token, expiresAt, checksum } = payload;
    const now = Date.now();

    upsertStudent.run(student.id, student.systemId ?? null, student.name, student.classLabel ?? null);

    // Parents before children: `packages` has a foreign key onto `assessments`,
    // so the assessment and its questions must land first. Marking the package
    // 'preparing' before that point fails the constraint outright.
    upsertAssessment.run(
      assessment.id,
      assessment.title,
      assessment.instructions ?? null,
      assessment.durationSeconds,
      assessment.config ? JSON.stringify(assessment.config) : null,
      questions.length,
      checksum,
      now
    );

    clearQuestions.run(assessment.id);
    questions.forEach((q, index) => {
      insertQuestion.run(
        q.id,
        assessment.id,
        q.position ?? index,
        q.code,
        q.questionText,
        q.questionType,
        q.options ? JSON.stringify(q.options) : null,
        q.imageUrl ?? null,
        // Set by the caller once the asset is on disk. Null until then, and a
        // picture question with a null path is not sittable.
        q.mediaPath ?? null,
        q.maxScore ?? null,
        q.config ? JSON.stringify(q.config) : null
      );
    });

    // Held at 'preparing' while the rest of the payload (media, in Phase 2)
    // is still being fetched, so a package is never listable mid-write.
    upsertPackage.run(assessment.id, student.id, token, 'preparing', now, expiresAt ?? null);

    if (questions.length !== assessment.expectedQuestionCount) {
      // Rolls the whole transaction back, including the 'preparing' package.
      throw new Error(
        `Package incomplete: expected ${assessment.expectedQuestionCount} questions, got ${questions.length}.`
      );
    }

    upsertPackage.run(assessment.id, student.id, token, 'ready', now, expiresAt ?? null);
    return { ready: true };
  });

  // ─── Sync queue (read side; the engine lands in Phase 4) ──────────────────

  const countQueue = db.prepare(
    'select status, count(*) as n from sync_queue group by status'
  );

  /**
   * The backoff is expressed here rather than in the engine.
   *
   * Claiming a row and then deciding it is too soon would mean marking it
   * failed again just to put it back, inflating its retry count for an attempt
   * that never happened — and re-selecting the same row on the next pass, which
   * spins. Filtering at selection time means an item that is waiting is simply
   * not offered.
   */
  const selectNextQueued = db.prepare(`
    select q.id            as queueId,
           q.retry_count   as retryCount,
           a.id            as attemptId,
           a.assessment_id as assessmentId,
           a.student_id    as studentId,
           a.device_id     as deviceId,
           a.started_at    as startedAt,
           a.submitted_at  as submittedAt,
           p.token         as token
      from sync_queue q
      join attempts a on a.id = q.attempt_id
      join packages p
        on p.assessment_id = a.assessment_id
       and p.student_id = a.student_id
     where q.status in ('pending', 'failed')
       and (
         q.last_attempt_at is null
         or q.last_attempt_at + (
              case q.retry_count
                when 0 then 0
                when 1 then 5000
                when 2 then 30000
                when 3 then 120000
                else 600000
              end
            ) <= ?
       )
     order by q.created_at
     limit 1
  `);

  const markSyncing = db.prepare(
    "update sync_queue set status = 'syncing', last_attempt_at = ? where id = ?"
  );

  /**
   * Takes the oldest outstanding submission and marks it in flight.
   *
   * Oldest first so a machine that has been offline for days uploads papers in
   * the order they were sat, and one item at a time so a lab reconnecting does
   * not open fifty concurrent requests over a link that is already the reason
   * this feature exists.
   */
  const claimNext = db.transaction((now = Date.now()) => {
    const row = selectNextQueued.get(now);
    if (!row) return null;

    markSyncing.run(now, row.queueId);

    const answers = {};
    for (const answer of selectAnswers.all(row.attemptId)) {
      answers[answer.question_id] = answer.value;
    }

    return {
      queueId: row.queueId,
      retryCount: row.retryCount,
      attemptId: row.attemptId,
      deviceId: row.deviceId,
      token: row.token,
      answers,
      // Measured from the signed start to the moment the device recorded the
      // submission, so it is the same number the server would have computed.
      timeSpentSeconds: Math.max(0, Math.round(((row.submittedAt ?? Date.now()) - row.startedAt) / 1000)),
      submittedAt: row.submittedAt ?? Date.now(),
    };
  });

  const markSyncedStmt = db.prepare(
    "update sync_queue set status = 'synced', synced_at = ?, error_message = null where id = ?"
  );

  /**
   * Only ever called after the server has confirmed the write.
   *
   * Nothing local is deleted at this point either: the attempt and its answers
   * stay on the machine. Disk is cheap and a lab technician being able to prove
   * a paper existed is not.
   */
  function markSynced(queueId) {
    markSyncedStmt.run(Date.now(), queueId);
  }

  const markFailedStmt = db.prepare(`
    update sync_queue
       set status = 'failed',
           retry_count = retry_count + 1,
           error_message = ?
     where id = ?
  `);

  /** A failed upload must never cost the student their work — only the row's
   *  status changes, and it stays eligible to be claimed again. */
  function markFailed(queueId, message) {
    markFailedStmt.run(String(message ?? '').slice(0, 500), queueId);
  }

  function syncStatus() {
    const counts = { pending: 0, syncing: 0, synced: 0, failed: 0 };
    for (const row of countQueue.all()) counts[row.status] = row.n;

    const pending = counts.pending + counts.failed;
    return {
      state: counts.syncing > 0 ? 'syncing' : pending > 0 ? 'idle' : 'complete',
      pending,
      total: pending + counts.synced,
      lastError: null,
    };
  }

  return {
    getActiveStudentId,
    setActiveStudentId,
    getActiveStudent,
    listPrepared,
    getPackage,
    getQuestions,
    getAttempt,
    saveAnswer,
    saveIndex,
    submit,
    savePackage,
    syncStatus,
    claimNext,
    markSynced,
    markFailed,
  };
}

module.exports = { createRepository };
