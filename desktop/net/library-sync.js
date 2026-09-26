'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

/**
 * Keeps the offline library on this machine in step with the server.
 *
 * Runs in the main process whenever the machine is online — at startup, on a
 * timer, after a sign-in, and on request — with nobody needing to press
 * anything, because the point is that the Library is already there when the
 * cable comes out. Public items are fetched with no session at all, so a
 * machine nobody has signed in on still gets a library.
 *
 * Failures are per item. One video that will not download must not stop the
 * forty PDFs after it, and never removes the copy already on disk: a row is
 * replaced only once its new files are complete.
 *
 * Deliberately free of Electron imports so it runs under plain Node in tests —
 * `fetchFn` and `mediaDir` are injected.
 */
function createLibrarySync({ baseUrl, fetchFn, library, mediaDir, now = () => Date.now() }) {
  let running = null;
  let state = {
    state: 'idle',
    done: 0,
    total: 0,
    lastError: null,
    lastSyncedAt: null,
  };
  const listeners = new Set();

  function setState(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        /* a broken listener must not stop a sync */
      }
    }
  }

  async function fetchCatalog() {
    const response = await fetchFn(new URL('/api/library/offline', baseUrl).toString(), {
      headers: { accept: 'application/json' },
    });
    const body = await response.json().catch(() => null);
    // A 2xx without `success: true` is a captive portal or proxy page, not a
    // catalog. Treating it as an empty one would prune the whole library.
    if (!response.ok || body?.success !== true || !Array.isArray(body.data?.items)) {
      throw new Error(body?.message || `Could not reach TERECO to update the library (HTTP ${response.status}).`);
    }
    return body.data;
  }

  /**
   * Downloads one URL into the media folder and returns its file name.
   *
   * Content-addressed by URL, so an unchanged page image is never fetched
   * twice and a re-sync after a new quiz costs only the quiz. Streamed to disk
   * rather than buffered: a library video can be hundreds of megabytes.
   */
  async function download(url, extension) {
    const digest = crypto.createHash('sha256').update(url).digest('hex').slice(0, 32);
    const name = `${digest}${extension}`;
    const file = path.join(mediaDir, name);
    if (fs.existsSync(file)) return name;

    const response = await fetchFn(url);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (HTTP ${response.status}).`);
    }

    // Written under a temporary name and renamed into place, so an interrupted
    // download never leaves a truncated file that looks complete next time.
    const partial = `${file}.part`;
    try {
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
      fs.renameSync(partial, file);
    } catch (err) {
      fs.rmSync(partial, { force: true });
      throw err;
    }
    return name;
  }

  async function downloadItem(item) {
    const files = { pages: null, stream: null, thumbnail: null, quizImages: {} };

    if (item.pageImageUrls) {
      files.pages = [];
      for (const url of item.pageImageUrls) files.pages.push(await download(url, '.jpg'));
    }
    if (item.streamUrl) {
      files.stream = await download(item.streamUrl, extensionFor(item.streamUrl, item.fileFormat));
    }
    if (item.thumbnailUrl) {
      // Decoration only: a card without its cover is still a working card.
      files.thumbnail = await download(item.thumbnailUrl, '.jpg').catch(() => null);
    }
    for (const quiz of item.quizzes ?? []) {
      for (const q of quiz.questions) {
        // Unlike the thumbnail, a question's picture may be the question, so
        // a failure here fails the item and it is retried next time.
        if (q.imageUrl) files.quizImages[q.id] = await download(q.imageUrl, extensionFor(q.imageUrl));
      }
    }
    return files;
  }

  /** Deletes media no row refers to any more — old versions, removed items. */
  function collectGarbage() {
    const keep = library.referencedFiles();
    for (const name of fs.readdirSync(mediaDir)) {
      if (keep.has(name)) continue;
      try {
        fs.rmSync(path.join(mediaDir, name), { force: true });
      } catch {
        /* in use (a video open right now); next pass gets it */
      }
    }
  }

  async function runOnce() {
    fs.mkdirSync(mediaDir, { recursive: true });
    setState({ state: 'syncing', done: 0, total: 0, lastError: null });

    let catalog;
    try {
      catalog = await fetchCatalog();
    } catch (err) {
      setState({ state: 'failed', lastError: err?.message ?? 'Network error' });
      return state;
    }

    const groups = [{ owner: '', items: catalog.items.filter((i) => i.audience === 'public') }];
    if (catalog.viewerId) {
      groups.push({ owner: catalog.viewerId, items: catalog.items.filter((i) => i.audience === 'personal') });
    }

    const work = groups.flatMap(({ owner, items }) => {
      const have = library.versions(owner);
      return items.filter((item) => have.get(item.id) !== item.version).map((item) => ({ owner, item }));
    });

    setState({ total: work.length });
    let failures = 0;
    let lastError = null;
    for (const { owner, item } of work) {
      try {
        library.saveItem(owner, item, await downloadItem(item));
      } catch (err) {
        failures += 1;
        lastError = `${item.title}: ${err?.message ?? 'download failed'}`;
      }
      setState({ done: state.done + 1 });
    }

    // Pruned only now, from a catalog that definitely arrived. A personal
    // group is pruned only for the learner the server answered for.
    for (const { owner, items } of groups) library.prune(owner, items.map((i) => i.id));
    collectGarbage();

    setState({
      state: failures > 0 ? 'failed' : 'complete',
      lastError,
      lastSyncedAt: now(),
    });
    return state;
  }

  /** One sync at a time; a second caller waits for the one in flight. */
  function run() {
    if (!running) {
      running = runOnce().finally(() => {
        running = null;
      });
    }
    return running;
  }

  return {
    run,
    status: () => state,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function extensionFor(url, fileFormat) {
  if (fileFormat) return `.${String(fileFormat).toLowerCase().replace(/^\./, '')}`;
  const match = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3|m4a|docx)(?:$|[?#])/i.exec(url);
  return match ? `.${match[1].toLowerCase()}` : '.bin';
}

module.exports = { createLibrarySync };
