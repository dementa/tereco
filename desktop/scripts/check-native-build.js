'use strict';

/**
 * Refuses to package an installer whose SQLite module Electron cannot load.
 *
 * The app opens the local database before it opens a window, so a binary built
 * for the wrong runtime does not degrade anything — it takes the whole process
 * down at startup, with no window and no dialog. That failure only shows up on
 * the machine the installer is carried to, long after the build that caused it,
 * so it is caught here instead.
 *
 * Two ways it goes wrong, both silent:
 *
 *   - the module ships prebuilt N-API binaries, which its binding.gyp detects
 *     and skips the compile for, so `electron-rebuild` reports success having
 *     built nothing and the prebuild is what gets packaged;
 *   - `electron-rebuild` never ran, leaving a binary compiled against whatever
 *     Node happened to install it.
 *
 * Rather than infer from the file, the module is actually loaded and used, in
 * Electron's own runtime (ELECTRON_RUN_AS_NODE — same binary and ABI, no
 * display needed). If that works here it works on the lab machine.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODULE = 'better-sqlite3-multiple-ciphers';
const desktopDir = path.join(__dirname, '..');
const moduleDir = path.join(desktopDir, 'node_modules', MODULE);
const binary = path.join(moduleDir, 'build', 'Release', 'better_sqlite3.node');

function fail(problem, remedy) {
  console.error(`\n[tereco] ${problem}\n\n${remedy}\n`);
  process.exit(1);
}

if (fs.existsSync(path.join(moduleDir, 'prebuilds'))) {
  fail(
    `${MODULE} ships prebuilt binaries, which take precedence over anything ` +
      'electron-rebuild compiles. The installed app would load a binary built ' +
      "for plain Node, not for Electron's runtime.",
    `Pin ${MODULE} to a version that has no prebuilds (12.11.1) in desktop/package.json.`
  );
}

if (!fs.existsSync(binary)) {
  fail(
    `${MODULE} has not been compiled: ${binary} is missing, so the installer ` +
      'would ship no SQLite binary at all.',
    'Run `npm run rebuild` in desktop/ and try again.'
  );
}

const electron = require('electron'); // path to the executable

// A file, not ':memory:': the encryption the app relies on is only available on
// a real database, and encryption is the half of this module most likely to be
// missing from a binary that otherwise loads.
const probeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tereco-')), 'probe.db');
const probe = `
  const Database = require(${JSON.stringify(moduleDir)});
  const db = new Database(${JSON.stringify(probeFile)});
  db.pragma("key = 'check'");
  db.pragma('journal_mode = WAL');
  db.exec('create table t (a integer)');
  db.prepare('insert into t values (?)').run(1);
  if (db.prepare('select count(*) as n from t').get().n !== 1) throw new Error('bad read');
`;

const result = spawnSync(electron, ['-e', probe], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
});

if (result.status !== 0) {
  const detail = [result.stderr, result.signal && `killed by ${result.signal}`]
    .filter(Boolean)
    .join('\n')
    .trim();
  fail(
    `${MODULE} could not be loaded by Electron's runtime, so the installed app ` +
      `would exit at startup with no window:\n\n${detail}`,
    'Run `npm run rebuild` in desktop/ and try again.'
  );
}

const { version } = require(path.join(desktopDir, 'node_modules', 'electron', 'package.json'));
console.log(`[tereco] ${MODULE} loads and stores rows under Electron ${version}.`);
