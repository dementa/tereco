'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3-multiple-ciphers');

const SCHEMA_VERSION = 1;

/**
 * Opens (and if necessary creates and migrates) the local database.
 *
 * Deliberately free of any Electron import so the same code can be exercised
 * under plain Node — see desktop/db/smoke.js. Electron-specific concerns, above
 * all where the encryption key comes from, live in desktop/db/key.js and are
 * passed in here.
 *
 * @param {object} options
 * @param {string} options.file  absolute path to the database file
 * @param {string|null} [options.key]  SQLCipher key; null leaves the file unencrypted
 * @returns {import('better-sqlite3-multiple-ciphers').Database}
 */
function openDatabase({ file, key = null }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const existed = fs.existsSync(file);
  const db = new Database(file);

  if (key) {
    // MUST be the first statement on the connection: SQLCipher needs the key
    // before it can read the header, so anything executed earlier fails.
    db.pragma(`key = '${key.replace(/'/g, "''")}'`);
  }

  assertReadable(db, file, existed, Boolean(key));

  // WAL keeps a reader (the UI) from blocking a writer (an answer being saved).
  db.pragma('journal_mode = WAL');

  /**
   * FULL, not the usual NORMAL.
   *
   * Under WAL, `synchronous = NORMAL` does not fsync on every commit, so the
   * last few commits can be lost if the machine loses power rather than
   * crashing. That is the exact event this whole feature exists because of: a
   * power cut wiped a room of learners' answers. Paying an fsync per answer is
   * the right trade when the alternative is losing the answer.
   */
  db.pragma('synchronous = FULL');

  db.pragma('foreign_keys = ON');

  migrate(db);
  return db;
}

/**
 * Fails loudly when an existing database cannot be read.
 *
 * The dangerous outcome is not an error, it is silence: an unreadable file
 * (wrong key after a Windows profile reset, corruption) must never be treated
 * as "no database yet", because the app would then create an empty one and a
 * student's unsent paper would look like it never existed.
 */
function assertReadable(db, file, existed, encrypted) {
  if (!existed) return;

  try {
    db.prepare('select count(*) from sqlite_master').get();
  } catch (err) {
    const reason = encrypted
      ? 'it cannot be decrypted with this machine\'s key'
      : 'the file is corrupt';
    const error = new Error(
      `The local assessment database at ${file} could not be opened because ${reason}. ` +
        'It has NOT been modified. Any unsent work is still in that file, so it must be ' +
        'preserved for recovery rather than deleted.'
    );
    error.cause = err;
    throw error;
  }
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  if (current >= SCHEMA_VERSION) return;

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  // One transaction: a migration interrupted by a power cut leaves the file at
  // its previous version rather than half-built.
  db.exec('begin');
  try {
    db.exec(schema);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}

module.exports = { openDatabase, SCHEMA_VERSION };
