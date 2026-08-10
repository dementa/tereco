'use strict';

const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * The bundled offline client. This is the default and the point of the app:
 * the code is installed on the machine, so the window opens with no network at
 * all. Previously this file loaded https://tereco.vercel.app, which meant every
 * screen arrived over the wire and the app was unusable once the lab switched
 * the internet off.
 */
const RENDERER_ENTRY = path.join(__dirname, 'renderer', 'dist', 'index.html');

/**
 * Optional remote override, kept for two cases only: pointing at a local
 * `next dev` while working on the web app, and the legacy online-only mode.
 * Priority: TERECO_APP_URL env var > --url=<url> CLI arg.
 *
 * Absent both, the app loads from disk. There is deliberately no default URL:
 * falling back to a remote origin is what made offline impossible.
 */
function resolveRemoteOverride() {
  if (process.env.TERECO_APP_URL) return process.env.TERECO_APP_URL;
  const arg = process.argv.find((a) => a.startsWith('--url='));
  if (arg) return arg.slice('--url='.length);
  return null;
}

const REMOTE_URL = resolveRemoteOverride();
let mainWindow = null;

function isSameOrigin(target, base) {
  try {
    return new URL(target).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function showLoadError(win, reason) {
  const heading = reason === 'bundle' ? 'TERECO Collect is damaged' : "Can't reach TERECO";
  const body =
    reason === 'bundle'
      ? 'The application files could not be opened. Your saved work is not affected. ' +
        'Ask your administrator to reinstall TERECO Collect on this computer.'
      : 'Check your internet connection and try again. The app needs to connect to the TERECO server.';

  const html = `data:text/html,${encodeURIComponent(`
    <html><head><meta charset="utf-8"><title>TERECO Collect</title>
    <style>
      html,body{height:100%;margin:0}
      body{display:flex;align-items:center;justify-content:center;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        background:#F5FDFF;color:#02465B;text-align:center;padding:24px}
      .card{max-width:420px}
      h1{font-size:20px;margin:0 0 8px}
      p{color:#5A7D8A;font-size:14px;line-height:1.5}
      button{margin-top:16px;background:#02465B;color:#fff;border:0;
        padding:10px 20px;border-radius:12px;font-size:14px;cursor:pointer}
    </style></head>
    <body><div class="card">
      <h1>${heading}</h1>
      <p>${body}</p>
      <button onclick="location.reload()">Retry</button>
    </div></body></html>`)}`;
  win.loadURL(html);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: '#F5FDFF',
    show: false,
    // Defence in depth: even if a menu is ever set again, no bar is drawn in
    // the window frame.
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    title: 'TERECO Collect',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (REMOTE_URL) {
    mainWindow.loadURL(REMOTE_URL);
  } else {
    mainWindow.loadFile(RENDERER_ENTRY);
  }

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED (e.g. client-side navigation), ignore it.
    if (!isMainFrame || errorCode === -3) return;

    // Loading from disk cannot fail for want of a network, so a failure here
    // means the renderer bundle is missing or corrupt — a broken install, not a
    // connectivity problem. Saying "check your internet" would send a lab
    // technician down entirely the wrong path.
    showLoadError(mainWindow, REMOTE_URL ? 'network' : 'bundle');
  });

  // Open external links (different origin, or target=_blank) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Offline mode is a file:// page. Nothing may navigate away from the
    // bundle: a paper in progress must not be replaceable by a remote page,
    // and an external link during a sitting belongs in the system browser.
    // Hash changes do not fire this event, so the in-app router is unaffected.
    const allowed = REMOTE_URL ? isSameOrigin(url, REMOTE_URL) : url.startsWith('file://');
    if (allowed) return;

    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // Reload came from the View menu, which no longer exists. Keeping F5 and
  // Ctrl/Cmd+R alive costs nothing visible and is the only way back from a
  // page that has hung — during a timed paper, "restart the whole app" is not
  // an acceptable recovery. Deliberately no devtools binding.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const nav = mainWindow.webContents.navigationHistory;

    const isReload = input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r');
    if (isReload) {
      event.preventDefault();
      mainWindow.webContents.reload();
      return;
    }

    // A window with no chrome has no Back button, so Alt+Left/Right are the
    // only history navigation there is. The app also offers its own way back
    // between screens; this covers the rest.
    if (input.alt && input.key === 'ArrowLeft' && nav.canGoBack()) {
      event.preventDefault();
      nav.goBack();
      return;
    }
    if (input.alt && input.key === 'ArrowRight' && nav.canGoForward()) {
      event.preventDefault();
      nav.goForward();
    }
  });

  // The mouse's dedicated back/forward buttons, which users reach for before
  // any keyboard shortcut.
  mainWindow.on('app-command', (event, command) => {
    const nav = mainWindow.webContents.navigationHistory;
    if (command === 'browser-backward' && nav.canGoBack()) {
      event.preventDefault();
      nav.goBack();
    } else if (command === 'browser-forward' && nav.canGoForward()) {
      event.preventDefault();
      nav.goForward();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * No File/Edit/View/Window/Help — the window shows the system and nothing else.
 *
 * Windows and Linux draw the menu bar INSIDE the window, so removing it is
 * what makes the window plain. macOS draws it at the top of the screen where
 * it costs the window nothing, and routes the clipboard shortcuts through it:
 * with no Edit menu there, Cmd+C/V/X/A stop working entirely in text fields —
 * which learners type answers into. So macOS keeps a minimal menu holding only
 * the shortcut roles, and no File/View/Help.
 */
function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        // Literal, not app.getName(): unpackaged that returns the package name
        // ("tereco-desktop"), which would sit in the macOS menu bar verbatim.
        label: 'TERECO Collect',
        submenu: [{ role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
      },
      {
        role: 'editMenu',
      },
    ])
  );
}

/**
 * Stable per-installation identifier.
 *
 * Written once to userData and read thereafter, so it survives app updates and
 * restarts but not a reimage — which is the correct behaviour, since a reimaged
 * machine genuinely is a new installation. It rides along in attempt metadata
 * so an administrator can tell which desk a paper was sat at.
 */
function readDeviceId() {
  const file = path.join(app.getPath('userData'), 'device-id');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    /* first run on this machine */
  }

  const id = crypto.randomUUID();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, id, 'utf8');
  } catch (err) {
    // A read-only profile would break persistence, so surface it rather than
    // silently handing out a fresh id on every launch.
    console.error('Could not persist device id:', err);
  }
  return id;
}

/**
 * Wiring for the bridge declared in desktop/renderer/src/tereco-bridge.d.ts.
 *
 * Every handler is a thin pass-through to the repository. Identity and time are
 * resolved here, never accepted from the renderer: `deviceId` comes from this
 * process and the active learner from the local session, so a page that lies
 * about who it is gets nowhere.
 */
function registerIpc(repo) {
  const deviceId = readDeviceId();

  const notYet = (phase) => () => {
    throw new Error(`Not implemented until Phase ${phase} (issue #33).`);
  };

  ipcMain.handle('tereco:device', () => ({
    deviceId,
    appVersion: app.getVersion(),
  }));

  ipcMain.handle('tereco:listPrepared', () => repo.listPrepared());
  ipcMain.handle('tereco:getPackage', (_e, assessmentId) => repo.getPackage(assessmentId));
  ipcMain.handle('tereco:getQuestions', (_e, assessmentId) => repo.getQuestions(assessmentId));

  ipcMain.handle('tereco:getAttempt', (_e, assessmentId) => repo.getAttempt(assessmentId, deviceId));
  ipcMain.handle('tereco:saveAnswer', (_e, attemptId, questionId, value) =>
    repo.saveAnswer(attemptId, questionId, value)
  );
  ipcMain.handle('tereco:saveIndex', (_e, attemptId, currentIndex) =>
    repo.saveIndex(attemptId, currentIndex)
  );
  ipcMain.handle('tereco:submit', (_e, attemptId) => repo.submit(attemptId));

  // Reads the queue truthfully already; the engine that drains it lands in
  // Phase 4, so retrying has nothing to retry yet.
  ipcMain.handle('tereco:syncStatus', () => repo.syncStatus());
  ipcMain.handle('tereco:retrySync', notYet(4));
}

/**
 * Opens the local database, or shows why it could not be opened.
 *
 * A failure here is never recoverable by retrying, and it must never be
 * mistaken for "no data yet" — an unreadable file may hold a room's worth of
 * unsent papers.
 */
function openLocalDatabase() {
  const { openDatabase } = require('./db');
  const { createRepository } = require('./db/repository');
  const { resolveEncryptionKey } = require('./db/key');

  const file = path.join(app.getPath('userData'), 'tereco.db');
  const db = openDatabase({ file, key: resolveEncryptionKey() });
  return createRepository(db);
}

// Single-instance lock so only one window runs.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();

    let repo;
    try {
      repo = openLocalDatabase();
    } catch (err) {
      // Starting without local storage would let a learner sit a paper whose
      // answers go nowhere. Refuse, and say what happened, rather than opening
      // a window that quietly loses their work.
      const { dialog } = require('electron');
      dialog.showErrorBox('TERECO Collect cannot start', String(err.message || err));
      app.quit();
      return;
    }

    registerIpc(repo);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
