'use strict';

/**
 * The offline library, as plain functions over the local database.
 *
 * Kept apart from repository.js because nothing here touches a learner's work:
 * it is a read-mostly cache of documents and practice quizzes, refreshed from
 * the server whenever the machine is online.
 *
 * Visibility follows the server: public items (owner '') are listed for anyone
 * at the machine, signed in or not; personal items only for the learner they
 * were fetched for. `getActiveStudentId` is injected so "who is at the desk"
 * has exactly one answer — the session in repository.js.
 */

/** How the renderer reaches a file on disk. Served by the protocol handler in main.js. */
const MEDIA_SCHEME = 'tereco-media';

function mediaUrl(fileName) {
  return fileName ? `${MEDIA_SCHEME}://library/${fileName}` : null;
}

function createLibraryRepository(db, { getActiveStudentId }) {
  const visibleOwners = () => {
    const studentId = getActiveStudentId();
    return studentId ? ['', studentId] : [''];
  };

  // ─── Written by the sync ────────────────────────────────────────────────

  const selectVersions = db.prepare('select id, version from library_items where owner_id = ?');

  /** id -> version already on disk for one owner, so unchanged items are skipped. */
  function versions(ownerId) {
    return new Map(selectVersions.all(ownerId).map((row) => [row.id, row.version]));
  }

  const upsertItem = db.prepare(`
    insert into library_items
      (id, owner_id, title, description, content_type, file_format, learning_area,
       author_name, file_bytes, version, stream_file, page_files_json, thumbnail_file, synced_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id, owner_id) do update set
      title = excluded.title, description = excluded.description,
      content_type = excluded.content_type, file_format = excluded.file_format,
      learning_area = excluded.learning_area, author_name = excluded.author_name,
      file_bytes = excluded.file_bytes, version = excluded.version,
      stream_file = excluded.stream_file, page_files_json = excluded.page_files_json,
      thumbnail_file = excluded.thumbnail_file, synced_at = excluded.synced_at
  `);
  const clearQuizzes = db.prepare('delete from library_quizzes where content_id = ? and owner_id = ?');
  const insertQuiz = db.prepare(`
    insert into library_quizzes (id, content_id, owner_id, position, title, questions_json)
    values (?, ?, ?, ?, ?, ?)
  `);

  /**
   * Stores one item whose files are ALREADY on disk.
   *
   * One transaction with its quizzes, so a learner never opens a document
   * whose quiz list belongs to the previous version.
   */
  const saveItem = db.transaction((ownerId, item, files) => {
    upsertItem.run(
      item.id,
      ownerId,
      item.title,
      item.description ?? '',
      item.contentType,
      item.fileFormat ?? null,
      item.learningArea ?? null,
      item.authorName ?? '',
      item.fileBytes ?? null,
      item.version,
      files.stream ?? null,
      files.pages ? JSON.stringify(files.pages) : null,
      files.thumbnail ?? null,
      Date.now()
    );

    clearQuizzes.run(item.id, ownerId);
    (item.quizzes ?? []).forEach((quiz, position) => {
      const questions = quiz.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? null,
        imageFile: files.quizImages?.[q.id] ?? null,
      }));
      insertQuiz.run(quiz.id, item.id, ownerId, position, quiz.title, JSON.stringify(questions));
    });
  });

  const selectOwnerIds = db.prepare('select id from library_items where owner_id = ?');
  const deleteItem = db.prepare('delete from library_items where id = ? and owner_id = ?');

  /**
   * Drops what the server no longer lists for this owner — unpublished,
   * archived, or retargeted away from the learner. Only ever called with a
   * catalog that was fetched successfully: an empty list from a failed request
   * would otherwise wipe the machine's library the moment the network drops.
   */
  const prune = db.transaction((ownerId, keepIds) => {
    const keep = new Set(keepIds);
    let removed = 0;
    for (const { id } of selectOwnerIds.all(ownerId)) {
      if (keep.has(id)) continue;
      deleteItem.run(id, ownerId);
      removed += 1;
    }
    return removed;
  });

  const selectAllFiles = db.prepare(
    'select stream_file, page_files_json, thumbnail_file from library_items'
  );
  const selectAllQuizQuestions = db.prepare('select questions_json from library_quizzes');

  /** Every media file some row still points at, for cleaning up the rest. */
  function referencedFiles() {
    const files = new Set();
    for (const row of selectAllFiles.all()) {
      if (row.stream_file) files.add(row.stream_file);
      if (row.thumbnail_file) files.add(row.thumbnail_file);
      for (const page of row.page_files_json ? JSON.parse(row.page_files_json) : []) files.add(page);
    }
    for (const row of selectAllQuizQuestions.all()) {
      for (const q of JSON.parse(row.questions_json)) if (q.imageFile) files.add(q.imageFile);
    }
    return files;
  }

  // ─── Read by the renderer ───────────────────────────────────────────────

  function ownerFilter() {
    const owners = visibleOwners();
    return { sql: `owner_id in (${owners.map(() => '?').join(', ')})`, params: owners };
  }

  /**
   * One row per document, even when it is stored both publicly and for this
   * learner — the personal copy wins, since it is the one fetched with their
   * own session.
   */
  function pickVisible(rows) {
    const byId = new Map();
    for (const row of rows) {
      const existing = byId.get(row.id);
      if (!existing || (existing.owner_id === '' && row.owner_id !== '')) byId.set(row.id, row);
    }
    return [...byId.values()];
  }

  function list() {
    const { sql, params } = ownerFilter();
    const rows = db
      .prepare(
        `select i.*,
                (select count(*) from library_quizzes q
                  where q.content_id = i.id and q.owner_id = i.owner_id) as quiz_count
           from library_items i
          where ${sql}
          order by i.title collate nocase`
      )
      .all(...params);

    return pickVisible(rows).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      contentType: row.content_type,
      fileFormat: row.file_format,
      learningArea: row.learning_area,
      authorName: row.author_name,
      thumbnailUrl: mediaUrl(row.thumbnail_file),
      quizCount: row.quiz_count,
      personal: row.owner_id !== '',
    }));
  }

  function findItemRow(contentId) {
    const { sql, params } = ownerFilter();
    const rows = db
      .prepare(`select * from library_items where id = ? and ${sql}`)
      .all(contentId, ...params);
    return pickVisible(rows)[0] ?? null;
  }

  const selectQuizzesFor = db.prepare(
    'select id, title, questions_json from library_quizzes where content_id = ? and owner_id = ? order by position'
  );

  /** The document, shaped like the web detail route so the shared viewers take it unchanged. */
  function getItem(contentId) {
    const row = findItemRow(contentId);
    if (!row) return null;

    const pages = row.page_files_json ? JSON.parse(row.page_files_json) : null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      contentType: row.content_type,
      fileFormat: row.file_format,
      learningArea: row.learning_area,
      authorName: row.author_name,
      thumbnailUrl: mediaUrl(row.thumbnail_file),
      pageImageUrls: pages ? pages.map(mediaUrl) : null,
      streamUrl: mediaUrl(row.stream_file),
      // Offline copies are for reading here, never for handing out again.
      downloadable: false,
      downloadAvailable: false,
      downloadUrl: null,
      quizzes: selectQuizzesFor.all(row.id, row.owner_id).map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        questionCount: JSON.parse(quiz.questions_json).length,
      })),
    };
  }

  const selectQuiz = db.prepare('select * from library_quizzes where id = ? and owner_id = ?');

  function findQuiz(quizId) {
    for (const owner of [...visibleOwners()].reverse()) {
      const row = selectQuiz.get(quizId, owner);
      if (row) return row;
    }
    return null;
  }

  /**
   * The learner's copy: no correct answers, no explanations — the same shape
   * as /api/library/quizzes/[id]/play, so the answer is not sitting in the page
   * to be read off before choosing. It is revealed by checkAnswer, as online.
   */
  function getPlayableQuiz(quizId) {
    const row = findQuiz(quizId);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      contentId: row.content_id,
      questions: JSON.parse(row.questions_json).map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        imageUrl: mediaUrl(q.imageFile),
      })),
    };
  }

  function checkAnswer(quizId, questionId, choice) {
    const row = findQuiz(quizId);
    if (!row) throw new Error('That quiz is not on this computer.');
    const question = JSON.parse(row.questions_json).find((q) => q.id === questionId);
    if (!question) throw new Error('That question is not in this quiz.');
    return {
      correct: question.correctIndex === choice,
      correctIndex: question.correctIndex,
      explanation: question.explanation ?? null,
    };
  }

  return { versions, saveItem, prune, referencedFiles, list, getItem, getPlayableQuiz, checkAnswer };
}

module.exports = { createLibraryRepository, MEDIA_SCHEME };
