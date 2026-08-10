import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the `@/*` -> `./*` mapping in tsconfig.json.
    alias: [{ find: /^@\//, replacement: `${here}/` }],
  },
  test: {
    /**
     * Node by default, because most of what needs testing here has no DOM:
     * the local SQLite repository, the package signing format, the sync queue.
     * Component tests opt into jsdom with a `@vitest-environment jsdom`
     * docblock at the top of the file.
     */
    environment: "node",
    globals: true,
    setupFiles: [path.join(here, "test/setup.ts")],
    include: ["**/*.test.{ts,tsx,js}"],
    exclude: ["node_modules/**", ".next/**", "desktop/renderer/dist/**", "desktop/dist/**"],
  },
});
