/**
 * Stand-in for `next/navigation` inside the Electron renderer.
 *
 * The offline client has no Next.js runtime and no HTTP server, so the App
 * Router hooks the shared components import do not exist. Rather than fork
 * `AssessmentTake.tsx` and `AssessmentList.tsx` into desktop copies that then
 * drift from the web ones, the Vite config aliases `next/navigation` here and
 * the components compile unchanged.
 *
 * Routing is hash-based (`#/assessment/<id>`). A `file://` page cannot use the
 * History API for real navigation — pushState would produce a URL pointing at
 * a path on disk that does not exist, and a reload would fail — so the hash is
 * the only workable location under `file://`.
 */

import { useCallback, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function readPath(): string {
  const raw = window.location.hash.slice(1);
  return raw.length > 0 ? raw : '/';
}

/** Server snapshot: the bundle never runs through SSR, but React requires it. */
function readPathServer(): string {
  return '/';
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, readPath, readPathServer);
}

export interface RouterShim {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
}

export function useRouter(): RouterShim {
  const push = useCallback((href: string) => {
    window.location.hash = href;
  }, []);

  const replace = useCallback((href: string) => {
    // replaceState keeps the entry out of history, so a student cannot use the
    // mouse back button to re-enter a paper they have already submitted.
    const url = `${window.location.pathname}${window.location.search}#${href}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);

  return {
    push,
    replace,
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    // No-ops: there is nothing to revalidate and nothing to prefetch when the
    // whole application is already on disk.
    refresh: () => {},
    prefetch: () => {},
  };
}

/**
 * Extracts route params from the hash path.
 *
 * Only the routes the offline client actually has are matched. Anything else
 * yields an empty object, which is what the App Router does for a segment the
 * current route does not declare.
 */
const ROUTES: ReadonlyArray<{ pattern: RegExp; keys: readonly string[] }> = [
  { pattern: /^\/assessment\/([^/]+)\/?$/, keys: ['id'] },
];

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const pathname = usePathname();

  for (const { pattern, keys } of ROUTES) {
    const match = pathname.match(pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return params as T;
  }

  return {} as T;
}

/** `useSearchParams` is not used by the assessment path; fail loudly if it starts being. */
export function useSearchParams(): never {
  throw new Error(
    'useSearchParams is not implemented in the desktop renderer shim. ' +
      'Add it to desktop/renderer/src/shims/next-navigation.tsx if a shared component needs it.'
  );
}
