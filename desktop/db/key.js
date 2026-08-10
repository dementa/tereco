'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const KEY_FILE = 'db.key';

/**
 * Supplies the SQLCipher key for the local database.
 *
 * A random 32-byte key is generated once per installation and stored encrypted
 * by the operating system — DPAPI on Windows, the Keychain on macOS, the
 * keyring on Linux — through Electron's `safeStorage`. Because DPAPI binds the
 * ciphertext to the Windows user account, copying `tereco.db` and `db.key` to
 * another machine yields a file that will not open. That is what stops a
 * student walking off with another desk's database on a USB stick.
 *
 * The key itself is never written in the clear and never leaves the main
 * process.
 */
function resolveEncryptionKey() {
  const file = path.join(app.getPath('userData'), KEY_FILE);

  if (!safeStorage.isEncryptionAvailable()) {
    /**
     * Happens on a Linux box with no keyring unlocked. The choice is between an
     * unencrypted local database and refusing to start.
     *
     * Refusing would lock a learner out of an exam they are sitting right now,
     * to protect a file that an attacker needs physical access to the machine
     * to read. Availability wins, loudly: the paper matters more, and the
     * warning tells an administrator the machine needs its keyring configured.
     */
    console.warn(
      '[tereco] OS encryption is unavailable, so the local assessment database ' +
        'will NOT be encrypted at rest. Configure a system keyring on this machine.'
    );
    return null;
  }

  if (fs.existsSync(file)) {
    try {
      return safeStorage.decryptString(fs.readFileSync(file));
    } catch (err) {
      // The key exists but will not decrypt — typically a rebuilt Windows
      // profile. Do NOT generate a fresh key: that would create an empty
      // database alongside a perfectly good one full of unsent work.
      const error = new Error(
        'The local database key could not be decrypted on this machine. Any unsent ' +
          'assessments are still stored here and must be recovered before reinstalling.'
      );
      error.cause = err;
      throw error;
    }
  }

  const key = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, safeStorage.encryptString(key), { mode: 0o600 });
  return key;
}

module.exports = { resolveEncryptionKey };
