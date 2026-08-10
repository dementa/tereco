# TERECO Collect — Desktop app

An [Electron](https://www.electronjs.org/) application that runs TERECO
assessments **offline**, on Windows, Linux and macOS. The lab switches the
internet off after a student logs in, so the app must work with no network at
all (issue #33).

The application code is bundled into the installer and loaded from disk. The
Supabase **service-role key stays server-side** and is never packaged: the
renderer reaches local data only through `contextBridge` IPC into the main
process, which owns the database and all network access.

## What loads

`main.js` loads `renderer/dist/index.html` from disk. There is deliberately no
default remote URL — falling back to one is what made offline impossible.

A remote override exists for development and the legacy online-only mode, in
priority order:

1. `TERECO_APP_URL` environment variable
2. `--url=<url>` command-line argument

## Develop / run locally

The renderer is built from the repo root, because it reuses the web app's React
components and shares its `node_modules`:

```bash
npm install            # repo root
npm run build:renderer # -> desktop/renderer/dist

cd desktop
npm install
npm start                                        # offline mode, loads from disk
TERECO_APP_URL=http://localhost:3000 npm start   # point at a local `next dev`
```

## Local database

SQLite via `better-sqlite3-multiple-ciphers`, at
`<userData>/tereco.db`, encrypted with a key held in the OS keystore
(`db/key.js`). Schema in `db/schema.sql`, data access in `db/repository.js`.

The connection runs `synchronous = FULL` rather than the usual `NORMAL`. Under
WAL, `NORMAL` does not fsync on commit, so the last few writes can be lost to a
power cut — the exact event this feature exists because of. An fsync per answer
is the right price.

### Testing it

```bash
node desktop/db/smoke.js   # 14 checks: prepare, resume, clock floor, submit, queue
```

> **The smoke test and Electron need different builds of the same native module.**
> `npm run rebuild` (and the `postinstall` hook) compiles
> `better-sqlite3-multiple-ciphers` against Electron's ABI, after which system
> Node can no longer load it and the smoke test fails with
> `NODE_MODULE_VERSION` mismatch. Run `npm rebuild better-sqlite3-multiple-ciphers`
> inside `desktop/` to switch it back for testing, and `npm run rebuild` before
> launching Electron. This is inherent to native modules, not a bug.

## Build installers

```bash
cd desktop
npm install
npm run dist:win     # Windows  -> dist/*.exe  (NSIS installer)
npm run dist:linux   # Linux    -> dist/*.AppImage and dist/*.deb
npm run dist:mac     # macOS    -> dist/*.dmg   (must run on a Mac)
```

Outputs land in `desktop/dist/`. The Windows artifact is
`dist/TERECO Collect Setup <version>.exe` — a ~78 MB NSIS installer.

### Building the Windows installer on Linux

It works, but electron-builder shells out to Windows tools through Wine to stamp
the .exe icon and version metadata, and **both** Wine architectures are needed —
`rcedit` is a 32-bit binary, so 64-bit Wine alone fails with
`failed to load ntdll.dll`:

```bash
sudo apt-get install -y wine64
sudo dpkg --add-architecture i386 && sudo apt-get update
sudo apt-get install -y wine32
```

Wine prints a wall of `err:` lines about missing displays and RPC services while
it does this. They are noise — the build is fine. `WINEDEBUG=-all` silences them.

`"publish": null` in the build config is load-bearing: without it electron-builder
tries to write auto-update metadata, finds no publish provider, and exits
non-zero *after* the installer has already been written — a failure that looks
like a broken build but isn't.

### macOS notes

macOS `.dmg` builds **must be produced on a Mac**. For distribution outside your
own machines you also need an Apple Developer ID certificate to sign and notarize;
unsigned builds will be blocked by Gatekeeper on other Macs. Signing/notarization
is configured via electron-builder env vars (`CSC_LINK`, `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

### Windows code signing (optional)

Unsigned Windows installers work but show a SmartScreen warning. To sign, provide
a code-signing certificate to electron-builder (`CSC_LINK` / `CSC_KEY_PASSWORD`).

## Icon

`build/icon.png` (1024×1024) is the source icon; electron-builder generates the
per-platform icon formats (`.ico`, `.icns`) from it automatically.
