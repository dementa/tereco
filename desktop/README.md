# TERECO Collect — Desktop app

A thin [Electron](https://www.electronjs.org/) wrapper that packages the deployed
TERECO web app as an installable desktop application for Windows, Linux and macOS.

It simply loads the deployed site in a native window. The Supabase **service-role
key stays server-side** on the deployment — it is never bundled into the desktop
client. The app therefore requires an internet connection.

## Configure the URL it loads

The app loads, in order of priority:

1. `TERECO_APP_URL` environment variable
2. `--url=<url>` command-line argument
3. `DEFAULT_URL` constant in `main.js`

Set `DEFAULT_URL` in `main.js` to your production domain **before building
installers** (e.g. `https://tereco.vercel.app`).

## Develop / run locally

```bash
cd desktop
npm install
TERECO_APP_URL=http://localhost:3000 npm start   # point at a local `next dev`
# or just: npm start   (uses DEFAULT_URL)
```

## Build installers

```bash
cd desktop
npm install
npm run dist:win     # Windows  -> dist/*.exe  (NSIS installer)
npm run dist:linux   # Linux    -> dist/*.AppImage and dist/*.deb
npm run dist:mac     # macOS    -> dist/*.dmg   (must run on a Mac)
```

Outputs land in `desktop/dist/`.

### macOS notes

macOS `.dmg` builds **must be produced on a Mac**. For distribution outside your
own machines you also need an Apple Developer ID certificate to sign and notarize;
unsigned builds will be blocked by Gatekeeper on other Macs. Signing/notarization
is configured via electron-builder env vars (`CSC_LINK`, `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

### Windows code signing (optional)

Unsigned Windows installers work but show a SmartScreen warning. To sign, provide
a code-signing certificate to electron-builder (`CSC_LINK` / `CSC_KEY_PASSWORD`).

## Auto-updates

Two independent layers:

- **Web content** updates automatically. The app loads the deployed site, so any
  new deploy is picked up on the next launch/reload — no desktop rebuild needed.
- **The desktop shell** (this Electron wrapper) updates via
  [`electron-updater`](https://www.electron.build/auto-update) against **GitHub
  Releases** (configured in `build.publish`). On launch, a packaged app checks
  for a newer release, downloads it in the background, and prompts the user to
  restart. Only needed when the wrapper itself changes (buttons, menu, Electron
  version) — rare.

To publish an update users will receive automatically:

```bash
cd desktop
# bump "version" in package.json, then:
GH_TOKEN=<github token with repo scope> npm run dist -- --publish always
```

This uploads the installers **and** the `latest*.yml` update manifests to a
GitHub Release. Installed apps compare their version against that manifest.
Without publishing (plain `npm run dist:*`), installers are produced but no
auto-update feed is created.

## Icon

`build/icon.png` (1024×1024) is the source icon; electron-builder generates the
per-platform icon formats (`.ico`, `.icns`) from it automatically.
