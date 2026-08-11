import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

/**
 * Makes the emitted HTML loadable from `file://`.
 *
 * Chromium treats a `file://` page as origin `null` and applies CORS to two
 * things Vite emits by default, both of which leave the window blank with
 * "blocked by CORS policy" in the console:
 *
 *   - `crossorigin` on the script and stylesheet tags, added for HTTP deploys.
 *   - `type="module"`, because ES module imports are CORS-checked. Vite hard-codes
 *     it on the entry tag even when the bundle is built as an IIFE.
 *
 * Neither has a Vite option, so both are removed here. Stripping `type="module"`
 * is only safe because `build.rollupOptions.output.format` is `iife` below; if
 * that ever goes back to `es`, this plugin must go with it.
 */
function makeFileProtocolSafe() {
  return {
    name: 'tereco-file-protocol-safe',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html
        .replace(/\s+crossorigin(=("|')[^"']*\2)?/g, '')
        /**
         * `type="module"` is deferred by default; a classic script is not.
         * Dropping the attribute without adding `defer` makes the bundle run
         * synchronously in <head>, before <body> is parsed, so
         * `document.getElementById('root')` is null and nothing ever mounts —
         * a silently blank window. `defer` restores the module timing.
         */
        .replace(/(<script\b[^>]*?)\s+type=("|')module\2/g, '$1 defer');
    },
  };
}

export default defineConfig({
  root: here,

  /**
   * MUST stay relative.
   *
   * The bundle is opened with `file://`, not served over HTTP, so the default
   * `base: '/'` would emit `<script src="/assets/index-abc.js">` — an absolute
   * path that resolves to the filesystem root on the lab machine and 404s.
   * './' is what makes the build loadable from disk at all, which is the whole
   * point of this target.
   */
  base: './',

  plugins: [react(), tailwindcss(), makeFileProtocolSafe()],

  resolve: {
    alias: [
      /**
       * The shared components import `next/navigation` (AssessmentTake.tsx:4,
       * AssessmentList.tsx:4). There is no Next runtime here, so the import is
       * redirected to a hash-router shim exposing the same three hooks. This
       * keeps the components byte-identical between web and desktop rather
       * than forking them.
       */
      {
        find: /^next\/navigation$/,
        replacement: path.resolve(here, 'src/shims/next-navigation.tsx'),
      },
      /**
       * Mirrors the `@/*` -> `./*` mapping in the root tsconfig.json so shared
       * components resolve their own imports unchanged.
       */
      { find: /^@\//, replacement: `${repoRoot}/` },
    ],
  },

  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
    // Lab machines run whatever Chromium ships with Electron 33 (Chrome 130),
    // so there is no legacy browser to down-level for.
    target: 'chrome130',

    /**
     * A classic script, not an ES module.
     *
     * Chromium applies CORS to ES module imports, and a `file://` page has a
     * `null` origin, so `<script type="module">` is blocked outright when the
     * app is opened from disk. An IIFE loads with a plain <script> tag and is
     * unaffected. This also means one JS file rather than a chunk graph, which
     * is what we want for a bundle that is read off a slow lab hard drive.
     *
     * If the client ever needs a real origin (service workers, IndexedDB
     * partitioning, a stricter CSP), the upgrade is to register a custom
     * `app://` protocol in main.js and switch this back to `es`.
     */
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },

  server: {
    fs: {
      // Components live above this root; Vite blocks that by default in dev.
      allow: [repoRoot],
    },
  },
});
