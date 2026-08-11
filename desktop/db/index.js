'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3-multiple-ciphers');

/**
 * Migrations are numbered files in db/migrations, applied in order.
 *
 * A lab machine keeps its database across app updates, so by the time a second
 * version ships there are installations sitting on the first one, possibly
 * holding unsent papers. Re-running a full schema would not reach them and
 * dropping the file would destroy the work, so the version has to be tracked
 * and the gap applied.
 */
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function loadMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const version = Number.parseInt(name.slice(0, 3), 10);
      if (!Number.isInteger(version) || version < 1) {
        throw new Error(`Migration "${name}" must start with a number, e.g. 003-thing.sql`);
      }
      return { version, name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8') };
    });
}

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

  for (const { version, name, sql } of loadMigrations()) {
    if (version <= current) continue;

    // One transaction per migration: interrupted by a power cut, the file is
    // left at the previous version rather than half-built. SQLite applies DDL
    // transactionally, so this genuinely rolls back.
    db.exec('begin');
    try {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
      db.exec('commit');
    } catch (err) {
      db.exec('rollback');
      const error = new Error(`Migration ${name} failed: ${err.message}`);
      error.cause = err;
      throw error;
    }
  }
}

/** Highest migration on disk. Exported so the smoke test can assert on it. */
function schemaVersion() {
  const all = loadMigrations();
  return all.length === 0 ? 0 : all[all.length - 1].version;
}

module.exports = { openDatabase, schemaVersion };
