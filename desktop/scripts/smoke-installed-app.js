'use strict';

/**
 * Launches the app that was just packaged and fails the build if it dies.
 *
 * Every startup failure this app has had looked identical from the outside: the
 * installer runs, the shortcut appears, and clicking it does nothing. A native
 * module built for the wrong runtime segfaults the process; a file left out of
 * the `files` list throws where main.js can only show a dialog and quit. None
 * of it is visible to a build that merely produces an .exe, and all of it is
 * visible within seconds of actually starting the thing.
 *
 * So: start the packaged binary, give it time to open the database, register
 * IPC and load the renderer, and require both that it is still running AND that
 * it announced itself. Nothing is asserted about what the window shows — that
 * is the renderer's own tests. This is the difference between "an installer
 * exists" and "the app runs".
 *
 * Still running is not enough on its own: main.js reports a fatal startup error
 * through `dialog.showErrorBox`, which is modal, so a machine with a display
 * sits on that dialog forever and the process outlives any timeout while no
 * application window exists at all. The `[tereco] ready` line is printed at the
 * end of a successful startup and nowhere else, so it is the honest signal.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ALIVE_MS = 20_000;
const READY = '[tereco] ready';

const distDir = path.join(__dirname, '..', 'dist');
const unpacked = fs
  .readdirSync(distDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.endsWith('-unpacked'))
  .map((e) => path.join(distDir, e.name));

if (unpacked.length === 0) {
  console.error('\n[tereco] no *-unpacked directory in desktop/dist: nothing was packaged.\n');
  process.exit(1);
}

const appDir = unpacked[0];

/**
 * The app's own executable, by name.
 *
 * Not "the first executable file in the directory": Electron ships next to
 * chrome-sandbox and a pile of shared objects, and starting one of those
 * proves nothing.
 */
const manifest = require(path.join(__dirname, '..', 'package.json'));
const candidates =
  process.platform === 'win32'
    ? [`${manifest.build.productName}.exe`, `${manifest.name}.exe`]
    : [manifest.name, manifest.build.productName];

const binary = candidates.map((name) => path.join(appDir, name)).find((file) => fs.existsSync(file));

if (!binary) {
  console.error(`\n[tereco] none of ${candidates.join(', ')} found in ${appDir}.\n`);
  process.exit(1);
}

console.log(`[tereco] starting ${binary}`);

const child = spawn(binary, ['--no-sandbox'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

const died = new Promise((resolve) =>
  child.on('exit', (code, signal) => resolve({ code, signal }))
);

const ready = new Promise((resolve) => {
  const check = () => output.includes(READY) && resolve('ready');
  child.stdout.on('data', check);
  child.stderr.on('data', check);
});

const timeout = new Promise((r) => setTimeout(() => r(null), ALIVE_MS));

Promise.race([died, ready, timeout]).then((result) => {
  if (result === 'ready') {
    child.kill();
    console.log('[tereco] the packaged app started and loaded its window.');
    return;
  }

  child.kill();
  const why =
    result === null
      ? `it never finished starting within ${ALIVE_MS / 1000}s`
      : `it exited during startup (${
          result.signal ? `signal ${result.signal}` : `code ${result.code}`
        })`;

  console.error(
    `\n[tereco] the packaged app did not start: ${why}. Installed on a lab ` +
      `machine this is the shortcut that opens nothing.\n\n${output.trim()}\n`
  );
  process.exit(1);
});
