import type { OfflineLibraryItem, OfflineQuiz } from "@/lib/library-offline";

/**
 * The public Library's offline copy in the browser: what an installed TERECO
 * Library (the PWA) reads with the network off.
 *
 * Opt-in per item ("Save for offline"), unlike the desktop app's full sync:
 * a phone's browser storage is a few hundred MB at best and can be evicted,
 * and one library video may be most of that.
 *
 * Two stores, written in a fixed order:
 *   - Cache Storage (FILES_CACHE) holds the bytes, keyed by their Cloudinary
 *     URL. public/sw.js answers the viewers' own requests for those URLs from
 *     it, so the PDF, video, audio and docx viewers work unchanged offline.
 *   - IndexedDB holds the item record — the /api/library/offline entry, with
 *     its quizzes and their answers, so practice quizzes mark locally.
 * The record is written only after every file is in the cache: an item that
 * is listed as saved always opens. Same rule as desktop/net/library-sync.js.
 *
 * Public items only. The offline catalog also carries a signed-in learner's
 * targeted items, but a browser is easily a shared device, so those are not
 * kept here.
 *
 * Cache names are shared with public/sw.js — change them in both places.
 */

export const FILES_CACHE = "tereco-library-files-v1";
export const PAGES_CACHE = "tereco-library-pages-v1";
export const STATIC_CACHE = "tereco-static-v1";

const DB_NAME = "tereco-library";
const STORE = "items";
const CHANGED_EVENT = "tereco-library-saved-changed";

export interface SavedLibraryItem extends OfflineLibraryItem {
  savedAt: number;
}

export interface SaveProgress {
  /** Bytes received so far across every file of the item. */
  loaded: number;
  /** Sum of the files' Content-Length where the server sent one; null until known. */
  total: number | null;
}

// ─── Pure ────────────────────────────────────────────────────

/** Every URL a saved item needs on the device to open and to run its quizzes. */
export function filesOf(item: OfflineLibraryItem): string[] {
  const urls = [
    ...(item.pageImageUrls ?? []),
    item.streamUrl,
    item.thumbnailUrl,
    ...item.quizzes.flatMap((quiz) => quiz.questions.map((q) => q.imageUrl)),
  ];
  return [...new Set(urls.filter((u): u is string => Boolean(u)))];
}

/** The pages to keep for an item: its detail page and each quiz page. */
export function pagesOf(item: OfflineLibraryItem): string[] {
  return [`/library/${item.id}`, ...item.quizzes.map((q) => `/library/${item.id}/quiz/${q.id}`)];
}

/** Marks against the saved answer key — offline there is no /check to ask. */
export function localCheck(quiz: OfflineQuiz) {
  return async (questionId: string, choice: number) => {
    const q = quiz.questions.find((x) => x.id === questionId);
    if (!q) throw new Error("That question is not in this quiz.");
    return { correct: choice === q.correctIndex, correctIndex: q.correctIndex, explanation: q.explanation };
  };
}

/** The quiz as the player takes it: answers left out, they come from localCheck. */
export function toPlayableQuiz(quiz: OfflineQuiz) {
  return {
    id: quiz.id,
    title: quiz.title,
    questions: quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, imageUrl: q.imageUrl })),
  };
}

/** A saved item in the shape the public detail route returns, so the detail page renders it unchanged. */
export function toDetailItem(item: OfflineLibraryItem) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    fileFormat: item.fileFormat,
    // The offline catalog leaves out past-paper download links: there is no
    // network to download from, and the reader is the copy.
    downloadable: false,
    downloadAvailable: false,
    downloadUrl: null,
    learningArea: item.learningArea,
    authorName: item.authorName,
    streamUrl: item.streamUrl,
    pageImageUrls: item.pageImageUrls,
    thumbnailUrl: item.thumbnailUrl,
    quizzes: item.quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      status: "published" as const,
      questionCount: q.questions.length,
    })),
    canManage: false,
  };
}

// ─── Browser IO ──────────────────────────────────────────────

export function isOfflineSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "caches" in window &&
    "indexedDB" in window &&
    "serviceWorker" in navigator
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function listSaved(): Promise<SavedLibraryItem[]> {
  if (!isOfflineSupported()) return [];
  return tx("readonly", (s) => s.getAll() as IDBRequest<SavedLibraryItem[]>);
}

export async function getSaved(id: string): Promise<SavedLibraryItem | null> {
  if (!isOfflineSupported()) return null;
  return (await tx("readonly", (s) => s.get(id) as IDBRequest<SavedLibraryItem | undefined>)) ?? null;
}

/** Fires whenever the saved set changes, so every open screen can re-read it. */
export function onSavedChange(listener: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}

function announce() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** The public half of the offline catalog — the only items this store keeps. */
export async function fetchOfflineCatalog(): Promise<OfflineLibraryItem[]> {
  const res = await fetch("/api/library/offline", { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success !== true || !Array.isArray(body.data?.items)) {
    throw new Error(body?.message || "Could not reach TERECO to save this item.");
  }
  return (body.data.items as OfflineLibraryItem[]).filter((i) => i.audience === "public");
}

/**
 * Downloads one file into the cache, streaming so progress can be shown and a
 * long video is never held in memory whole. CORS first (a readable response
 * can be sliced into the byte ranges a <video> asks for); an opaque no-cors
 * response is the fallback for an image whose host did not answer CORS.
 */
async function cacheFile(cache: Cache, url: string, onBytes: (n: number, length: number | null) => void) {
  if (await cache.match(url, { ignoreVary: true })) return;

  let res: Response;
  try {
    res = await fetch(url, { mode: "cors", credentials: "omit" });
  } catch {
    res = await fetch(url, { mode: "no-cors", credentials: "omit" });
  }
  if (res.type !== "opaque" && !res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);

  if (res.type === "opaque" || !res.body) {
    await cache.put(url, res);
    onBytes(0, null);
    return;
  }

  // fetch() has already decoded any content-encoding, so a compressed
  // length would be wrong for the stored bytes; keep it only when unencoded.
  const length = res.headers.get("content-encoding") ? null : Number(res.headers.get("content-length")) || null;
  const headers = new Headers({ "content-type": res.headers.get("content-type") ?? "application/octet-stream" });
  if (length) headers.set("content-length", String(length));
  onBytes(0, length);
  const [toCache, toCount] = res.body.tee();
  const counting = (async () => {
    const reader = toCount.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onBytes(value.byteLength, null);
    }
  })();
  await Promise.all([cache.put(url, new Response(toCache, { status: 200, headers })), counting]);
}

/** Keeps a page's HTML and the build files it loads, so it opens on a cold start offline. */
async function cachePage(path: string) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await (await caches.open(PAGES_CACHE)).put(path, res);

  const staticCache = await caches.open(STATIC_CACHE);
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? []);
  await Promise.all(
    [...assets].map(async (asset) => {
      if (await staticCache.match(asset)) return;
      const r = await fetch(asset).catch(() => null);
      if (r?.ok) await staticCache.put(asset, r);
    })
  );
}

/**
 * Saves one item for offline use. Asks the browser to keep the storage
 * (navigator.storage.persist) so it is not evicted the first time the device
 * runs low — Chrome grants it to installed apps, Safari decides for itself.
 */
export async function saveItem(item: OfflineLibraryItem, onProgress?: (p: SaveProgress) => void): Promise<void> {
  await navigator.storage?.persist?.().catch(() => false);

  const cache = await caches.open(FILES_CACHE);
  const urls = filesOf(item);
  const lengths = new Map<string, number | null>();
  let loaded = 0;
  const report = () => {
    const known = [...lengths.values()];
    const total = known.length === urls.length && known.every((n) => n !== null) ? known.reduce<number>((a, n) => a + (n ?? 0), 0) : null;
    onProgress?.({ loaded, total });
  };

  // One at a time: a phone on a school connection does better with one
  // video than with forty page images fighting it.
  for (const url of urls) {
    await cacheFile(cache, url, (bytes, length) => {
      if (length !== null || !lengths.has(url)) lengths.set(url, length);
      loaded += bytes;
      report();
    });
  }
  await Promise.all(pagesOf(item).map((p) => cachePage(p).catch(() => {})));

  await tx("readwrite", (s) => s.put({ ...item, savedAt: Date.now() } satisfies SavedLibraryItem));
  announce();
}

/** Removes an item, and every cached file no other saved item still uses. */
export async function removeItem(id: string): Promise<void> {
  const item = await getSaved(id);
  await tx("readwrite", (s) => s.delete(id));
  if (item) {
    const stillUsed = new Set((await listSaved()).flatMap(filesOf));
    const files = await caches.open(FILES_CACHE);
    await Promise.all(filesOf(item).filter((u) => !stillUsed.has(u)).map((u) => files.delete(u)));
    const pages = await caches.open(PAGES_CACHE);
    await Promise.all(pagesOf(item).map((p) => pages.delete(p)));
  }
  announce();
}

/**
 * Brings saved items in line with the server, when online: an item edited
 * since it was saved (its version changed) is downloaded again; one that is no
 * longer public — archived, or now aimed at a school — is removed.
 *
 * Never prunes on a failed catalog request; a captive portal is not "nothing
 * is public any more".
 */
export async function refreshSaved(): Promise<void> {
  const saved = await listSaved();
  if (saved.length === 0 || !navigator.onLine) return;

  let catalog: OfflineLibraryItem[];
  try {
    catalog = await fetchOfflineCatalog();
  } catch {
    return;
  }
  const byId = new Map(catalog.map((i) => [i.id, i]));
  for (const item of saved) {
    const current = byId.get(item.id);
    if (!current) await removeItem(item.id);
    else if (current.version !== item.version) await saveItem(current).catch(() => {});
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const e = await navigator.storage?.estimate?.().catch(() => null);
  return e && e.quota ? { usage: e.usage ?? 0, quota: e.quota } : null;
}
