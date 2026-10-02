/**
 * TERECO service worker: makes the public Library (/library) installable and
 * readable offline.
 *
 * Deliberately narrow. It answers only:
 *   - navigations under /library            network first, cached copy offline
 *   - /_next/static/*                       cache first (hashed, never change)
 *   - /api/library/public GETs              network first, cached copy offline
 *   - res.cloudinary.com files a user saved from the cache, with byte ranges
 * Every portal page and every other request goes to the network untouched,
 * so a signed-in screen can never be served stale from here.
 *
 * What gets saved is decided by the page (lib/library-offline-store.ts, the
 * "Save for offline" button); this worker only serves it. Cache names are
 * shared with that file.
 */
importScripts('/sw-range.js');

const FILES_CACHE = 'tereco-library-files-v1';
const PAGES_CACHE = 'tereco-library-pages-v1';
const STATIC_CACHE = 'tereco-static-v1';
const API_CACHE = 'tereco-library-api-v1';
const CURRENT = [FILES_CACHE, PAGES_CACHE, STATIC_CACHE, API_CACHE];

const SHELL = ['/library', '/manifest.webmanifest'];
// Only the anonymous public routes. /api/library/offline is never cached
// here: with a learner signed in it also carries their targeted items and
// quiz answers, which must not outlive the session on a shared device.
const LIBRARY_APIS = ['/api/library/public'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE);
      // One by one, so a single failure (offline install, a 500) does not
      // abort the install; the page fills in on the next online visit.
      await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('tereco-') && !CURRENT.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'res.cloudinary.com') {
    event.respondWith(savedFileOrNetwork(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && (url.pathname === '/library' || url.pathname.startsWith('/library/'))) {
    event.respondWith(libraryPage(request, url));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (LIBRARY_APIS.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'))) {
    event.respondWith(networkFirst(request, API_CACHE));
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/**
 * A Library page. Offline, the exact page if it was saved or visited;
 * otherwise the Library home, which lists what is on this device.
 */
async function libraryPage(request, url) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) await cache.put(url.pathname, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(url.pathname)) ||
      (await cache.match('/library')) ||
      new Response('<h1>You are offline</h1><p>Open the Library once while online to use it offline.</p>', {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    );
  }
}

/** A Cloudinary file the user saved, sliced for Range requests; anything else from the network. */
async function savedFileOrNetwork(request) {
  const cache = await caches.open(FILES_CACHE);
  const cached = await cache.match(request.url, { ignoreVary: true });
  if (!cached) return fetch(request);

  const rangeHeader = request.headers.get('range');
  // An opaque copy cannot be read, so it cannot be sliced; images never ask for ranges anyway.
  if (!rangeHeader || cached.type === 'opaque') return cached;

  const blob = await cached.blob();
  const range = parseByteRange(rangeHeader, blob.size);
  const type = cached.headers.get('content-type') || 'application/octet-stream';
  if (!range) {
    return new Response(blob, { status: 200, headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(blob.size) } });
  }
  if (range.unsatisfiable) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${blob.size}` } });
  }
  return new Response(blob.slice(range.start, range.end + 1), {
    status: 206,
    headers: {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-length': String(range.end - range.start + 1),
      'content-range': `bytes ${range.start}-${range.end}/${blob.size}`,
    },
  });
}
