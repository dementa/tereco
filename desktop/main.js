'use strict';

const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'About TERECO Collect',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About TERECO Collect',
              message: 'TERECO Collect',
              detail: `Version ${app.getVersion()}\nConnected to: ${APP_URL}`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
