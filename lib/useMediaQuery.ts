'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query from JS.
 *
 * Needed because a few layout decisions cannot be expressed in CSS: Recharts
 * takes axis width, bar size and margins as numeric props, so a chart that is
 * fine on a laptop gives a 360px phone a 120px-wide category axis and almost no
 * plot area. Those props have to change in JS or not at all.
 *
 * Built on `useSyncExternalStore` rather than useState+useEffect: matchMedia is
 * an external store, and reading it in an effect would mean a setState during
 * mount (which react-hooks/set-state-in-effect rightly flags) plus a torn first
 * paint. The server snapshot is `false`, so SSR renders the desktop layout and
 * phones correct themselves on hydration — fine for a chart, so prefer a
 * Tailwind breakpoint anywhere CSS can express the same thing.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    [query]
  );

  // Returns a boolean, so React's identity check settles immediately — there is
  // no new object per call to loop on.
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True below Tailwind's `sm` breakpoint — i.e. on phones. */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 639px)');
}
