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
(`db/key.js`). Schema in `db/migrations/` (numbered, applied in order and
tracked in `user_version`), data access in `db/repository.js`.

The connection runs `synchronous = FULL` rather than the usual `NORMAL`. Under
WAL, `NORMAL` does not fsync on commit, so the last few writes can be lost to a
power cut — the exact event this feature exists because of. An fsync per answer
is the right price.

### Testing it

Tests run from the repo root with Vitest:

```bash
npm test                                  # everything
npx vitest run desktop/db                 # just the database
```

> **The tests and Electron need different builds of the same native module.**
> `npm run rebuild` (and the `postinstall` hook) compiles
> `better-sqlite3-multiple-ciphers` against Electron's ABI, after which system
> Node can no longer load it and the tests fail with
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

Each `dist:*` script first runs `prepack:check`, which refuses to package a
renderer bundle that is missing or a SQLite binary Electron cannot load. After
building, `npm run smoke` starts the packaged app and fails if it exits — an
installer that exists is not an app that starts, and every startup failure this
client has had looked the same from outside: the shortcut opens nothing.

### The pinned SQLite version is load-bearing

`better-sqlite3-multiple-ciphers` is pinned to **12.11.1**, exactly, and must
not be moved to 13.x. From 13.0.0 the module ships prebuilt binaries, and its
`binding.gyp` skips compiling when it finds one — so `electron-rebuild` reports
"Rebuild Complete" having built nothing, and the installer carries a binary
built for plain Node. Loading it inside Electron segfaults the process before
any window or error dialog exists: the app installs, and clicking it does
nothing at all. 12.11.1 has no prebuilds, so the rebuild genuinely happens and
the binary matches Electron's ABI.

`npm run native:check` (part of `prepack:check`) is what enforces this: it opens
an encrypted database using Electron's own runtime and fails the build if the
module ships prebuilds or will not load.

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

## Package signing keys

Offline packages are authorised by an Ed25519 grant signed by the server and
verified on the device. Generate a pair with:

```bash
node scripts/gen-package-keys.mjs [keyId]
```

The **private** key goes in the deployment environment and nowhere else:

```
TERECO_PACKAGE_KEY_ID=tereco-2026-08
TERECO_PACKAGE_SIGNING_KEY="-----BEGIN PRIVATE KEY-----\n…"
```

The **public** key goes in `desktop/keys/package-keys.json`, which ships inside
the installer. It holds no secret, so verification works with no network.

To rotate, add a new key id alongside the existing one. Machines not yet
updated keep verifying grants signed by the key they know, so a rotation does
not brick a lab mid-term. Only drop an old public key once every machine has
been updated **and** every grant signed with it has expired (14 days).

`prepare.js` verifies grants with `lib/offline/package-token.js` from the repo
root, shared with the Next.js route that signs them. It lives outside `desktop/`
and so outside the asar, and is copied into the installer as `extraResources`,
landing at `resources/lib/offline` — which is exactly where the `../../lib/...`
require resolves from inside the archive. Without it the app throws while
registering IPC and quits during startup.

The desktop talks to `TERECO_API_URL` (default `https://tereco.vercel.app`) for
sign-in and preparation. That is separate from `TERECO_APP_URL`, which only
decides what the window loads.

### Testing it

```bash
npx vitest run desktop/net   # signing, tamper rejection, preparation
```
