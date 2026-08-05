import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the logic layer.
 *
 * Scoped to `lib/` on purpose. The parts of this codebase that fail SILENTLY —
 * producing a plausible number rather than an error — are pure functions over
 * data: the practical aggregation, and the offline outbox's merge and drain
 * rules. Those are cheap to test and expensive to get wrong, because a wrong
 * practical score looks exactly like a right one.
 *
 * Components and routes are deliberately not covered here. They need a DOM or a
 * live Supabase, and mocking either would mostly test the mocks. Browser-level
 * verification is a separate job (Playwright), still outstanding.
 *
 * `.mts` rather than `.ts` so Vite loads it as ESM natively; tsconfig path
 * aliases (`@/…`) resolve through `resolve.tsconfigPaths` rather than a plugin.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
