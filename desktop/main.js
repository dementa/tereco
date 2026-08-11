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

/**
 * Where the deployment lives.
 *
 * Distinct from REMOTE_URL, which only decides what the WINDOW loads. This is
 * the origin the main process talks to during online preparation and, later,
 * sync — the two are separate because the window loads from disk while the
 * network calls still go to the server.
 */
const API_BASE_URL = process.env.TERECO_API_URL || 'https://tereco.vercel.app';

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
    // Shown at once, on the app's own background colour, rather than held back
    // until the renderer paints. On a lab PC the bundle takes seconds to parse,
    // and hiding the window until then means a double-click does nothing
    // visible: people conclude the app is broken and click again — which the
    // single-instance lock then swallows. index.html paints its own "Starting"
    // line before any script runs, so the wait is at least visibly a wait.
    show: true,
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

  const { net } = require('electron');
  const { prepareAssessment } = require('./net/prepare');
  const { createSyncEngine } = require('./net/sync');

  /**
   * Public keys that may have signed a package, by key id.
   *
   * Shipped inside the installer, so verification needs no network and holds no
   * secret. A map rather than one key: a machine that has not been reinstalled
   * since a rotation still verifies grants signed by the key it knows.
   */
  const publicKeys = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'keys', 'package-keys.json'), 'utf8')
  );

  const mediaDir = path.join(app.getPath('userData'), 'media');

  /**
   * Every request this app makes.
   *
   * Electron's net.fetch, not global fetch: it goes through the app session, so
   * the sign-in cookie is stored and replayed by the main process and never
   * exists anywhere the renderer can read it.
   *
   * TERECO_BYPASS_SECRET is for testing against a Vercel preview, which sits
   * behind Deployment Protection. A browser can complete that login; this app
   * cannot, so without the header every request is redirected to Vercel SSO and
   * nothing downloads. Vercel's own mechanism for non-browser clients — see
   * Protection Bypass for Automation — is this header.
   *
   * Unset in production and unset by default, so a real installer sends
   * nothing. It is a development convenience, never a credential the app
   * depends on.
   */
  const bypassSecret = process.env.TERECO_BYPASS_SECRET;

  const fetchFn = (url, init = {}) =>
    net.fetch(url, {
      ...init,
      headers: bypassSecret
        ? { ...(init.headers ?? {}), 'x-vercel-protection-bypass': bypassSecret }
        : init.headers,
    });

  if (bypassSecret) {
    console.log('[tereco] sending a Vercel protection-bypass header (preview testing)');
  }

  ipcMain.handle('tereco:signIn', async (_e, credentials) => {
    const response = await fetchFn(new URL('/api/auth/login', API_BASE_URL).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.success !== true) {
      throw new Error(body?.message || 'Could not sign in.');
    }

    const user = body.user ?? body.data?.user ?? null;
    if (!user?.id) throw new Error('Could not sign in.');

    // Binds the local database to this learner, and stores them, so the
    // identity is readable with no network. Everything the renderer can then
    // list or open is scoped to them.
    repo.signIn({
      id: user.id,
      systemId: user.staffId || null,
      // The column is NOT NULL and the display falls back to the id, which is
      // better than refusing a sign-in over a missing name.
      name: user.name || user.staffId || 'Student',
      classLabel: user.className || null,
    });
    return user;
  });

  ipcMain.handle('tereco:signOut', () => {
    repo.setActiveStudentId(null);
  });

  /**
   * Who is signed in on this machine, read from the local database.
   *
   * The web app rehydrates its session from /api/auth/me on every load. Offline
   * that call fails, the app concludes nobody is signed in, and the learner is
   * bounced out of the paper they are sitting. This is the same answer without
   * a network.
   */
  ipcMain.handle('tereco:currentUser', () => repo.getActiveStudent());

  const sync = createSyncEngine({ baseUrl: API_BASE_URL, repo, fetchFn });

  /**
   * Drains the queue whenever the machine has a network again.
   *
   * Polling rather than listening for an online event: a lab machine is often
   * "connected" to a router that cannot reach the internet, so the only honest
   * test is trying. Failures cost one request and back off from there.
   *
   * Runs unprompted because the learner who sat the paper has usually gone home
   * by the time the connection returns. Nobody should have to remember to press
   * a button for a submission to reach the school.
   */
  const SYNC_POLL_MS = 60_000;
  const pump = () => {
    if (!net.isOnline()) return;
    sync.drain().catch((err) => console.error('[tereco] sync failed:', err));
  };
  setInterval(pump, SYNC_POLL_MS).unref?.();
  setTimeout(pump, 5_000).unref?.();

  /**
   * Papers this learner may sit, from the server. Online only, by nature: it is
   * the list of what could still be downloaded before the cable comes out.
   */
  ipcMain.handle('tereco:availableAssessments', async () => {
    const response = await fetchFn(new URL('/api/assessments', API_BASE_URL).toString(), {
      headers: { accept: 'application/json' },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
      throw new Error(body?.message || 'Could not reach TERECO to list your assessments.');
    }
    return body.data ?? [];
  });

  ipcMain.handle('tereco:prepare', (_e, assessmentSystemId) =>
    prepareAssessment({
      baseUrl: API_BASE_URL,
      assessmentSystemId,
      deviceId,
      repo,
      mediaDir,
      publicKeys,
      fetchFn,
    })
  );

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

  ipcMain.handle('tereco:syncStatus', () => sync.status());

  // Manual retry behind the "Synchronization incomplete" state, for when
  // someone is standing at the machine and would rather not wait for the poll.
  ipcMain.handle('tereco:retrySync', async () => {
    await sync.drain();
    return sync.status();
  });
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

  /**
   * Nothing during startup may fail silently.
   *
   * Only the database call used to be guarded, and it sat inside a `.then()`.
   * Anything thrown by `registerIpc` — reading and parsing the signing keys,
   * loading the native SQLite module, requiring the sync engine — became an
   * unhandled promise rejection, which Electron reports nowhere. The result was
   * no window, no dialog and no message: the app simply did not appear, which
   * is indistinguishable from a machine that will never run it.
   */
  function fatal(stage, err) {
    const detail = err && err.stack ? err.stack : String(err);
    // The terminal first, so `npm start` output carries it even if the dialog
    // is dismissed or never renders.
    console.error(`\n[tereco] startup failed during ${stage}:\n${detail}\n`);
    try {
      require('electron').dialog.showErrorBox(
        'TERECO Collect cannot start',
        `${stage}\n\n${err && err.message ? err.message : String(err)}`
      );
    } catch {
      /* dialog needs a ready app; the console line above is the fallback */
    }
    app.quit();
  }

  // Last line of defence: anything that escapes the handlers below still gets
  // printed rather than vanishing.
  process.on('uncaughtException', (err) => fatal('an unexpected error', err));
  process.on('unhandledRejection', (err) => fatal('an unexpected error', err));

  app.whenReady().then(() => {
    try {
      buildMenu();
    } catch (err) {
      return fatal('building the menu', err);
    }

    /**
     * The bundle is a build artefact, and `renderer/dist` is gitignored — so a
     * fresh clone has no application in it until `npm run build:renderer` is
     * run from the REPO ROOT, not from here. Checking up front turns a blank
     * or erroring window into a sentence that says what to do.
     */
    if (!REMOTE_URL && !fs.existsSync(RENDERER_ENTRY)) {
      return fatal(
        'locating the application files',
        new Error(
          `No renderer bundle at ${RENDERER_ENTRY}.\n\n` +
            'Run this from the repository root, not from desktop/:\n\n' +
            '    npm install\n' +
            '    npm run build:renderer\n\n' +
            'then start the app again.'
        )
      );
    }

    let repo;
    try {
      repo = openLocalDatabase();
    } catch (err) {
      // Starting without local storage would let a learner sit a paper whose
      // answers go nowhere. Refuse, and say what happened, rather than opening
      // a window that quietly loses their work.
      return fatal('opening the local database', err);
    }

    try {
      registerIpc(repo);
    } catch (err) {
      return fatal('setting up the local services', err);
    }

    try {
      createWindow();
    } catch (err) {
      return fatal('opening the window', err);
    }

    console.log(
      `[tereco] ready in ${Math.round(process.uptime() * 1000)}ms — API ${API_BASE_URL}, ` +
        `loading ${REMOTE_URL || RENDERER_ENTRY}`
    );

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
