'use strict';

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

/**
 * The deployed TERECO web app the desktop client loads.
 * Priority: TERECO_APP_URL env var > --url=<url> CLI arg > DEFAULT_URL.
 * Update DEFAULT_URL to the production Vercel domain before building installers.
 */
const DEFAULT_URL = 'https://tereco.vercel.app';

function resolveAppUrl() {
  if (process.env.TERECO_APP_URL) return process.env.TERECO_APP_URL;
  const arg = process.argv.find((a) => a.startsWith('--url='));
  if (arg) return arg.slice('--url='.length);
  return DEFAULT_URL;
}

const APP_URL = resolveAppUrl();
let mainWindow = null;

function isSameOrigin(target, base) {
  try {
    return new URL(target).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function showLoadError(win) {
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
      <h1>Can't reach TERECO</h1>
      <p>Check your internet connection and try again. The app needs to connect to the TERECO server.</p>
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

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED (e.g. client-side navigation), ignore it.
    if (isMainFrame && errorCode !== -3) {
      showLoadError(mainWindow);
    }
  });

  // Open external links (different origin, or target=_blank) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isSameOrigin(url, APP_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
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
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
