import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // The Electron main and preload scripts are CommonJS by requirement — they
  // run in Electron's main process, not the Next bundle, and `require` is the
  // correct form there. The TS rule that bans it does not apply to them.
  //
  // lib/offline/package-token.js is the same situation from the other side: it
  // is the ONE copy of the package signing format, shared by the Next route
  // that signs and the Electron main process that verifies. Electron 33 runs
  // Node 20 with no TypeScript, so the shared file has to be CommonJS. A second
  // implementation for the desktop would be two copies of exacting crypto code
  // where a silent disagreement makes good packages fail to verify at exam
  // time. Types live in the sibling .d.ts.
  {
    files: ["desktop/**/*.js", "lib/offline/package-token.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
