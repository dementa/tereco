/**
 * Runs before every test file.
 *
 * jest-dom's matchers are only meaningful in a DOM, and most suites here run in
 * the node environment (the SQLite repository, package signing), so importing
 * them unconditionally would fail those files. Loading them lazily keeps one
 * setup file for both environments.
 */
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}

export {};
