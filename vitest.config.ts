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
     * Node by default, because most of what needs testing here has no DOM: the
     * pure logic in lib/ (practical aggregation, the outbox merge and drain
     * rules, marking), the local SQLite repository, the package signing format,
     * the sync queue. Those are the parts that fail SILENTLY — producing a
     * plausible number rather than an error — which is exactly what makes them
     * worth testing and expensive to get wrong.
     *
     * Component tests opt into jsdom with a `@vitest-environment jsdom`
     * docblock at the top of the file. They were once ruled out here on the
     * grounds that mocking a DOM mostly tests the mocks; that turned out to be
     * wrong for the take screen specifically, where characterisation tests
     * caught a dead progress restore and a crash in a React effect that nothing
     * else would have found.
     */
    environment: "node",
    globals: true,
    setupFiles: [path.join(here, "test/setup.ts")],
    include: ["**/*.test.{ts,tsx,js}"],
    exclude: ["node_modules/**", ".next/**", "desktop/renderer/dist/**", "desktop/dist/**"],
  },
});
