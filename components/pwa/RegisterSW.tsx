'use client';

import { useEffect } from 'react';

/**
 * Registers public/sw.js, which makes the public Library installable and
 * readable offline. Production only: in `next dev` a worker caching
 * /_next/static would serve stale chunks across hot reloads.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.error('[tereco] service worker registration failed:', err));
  }, []);
  return null;
}
