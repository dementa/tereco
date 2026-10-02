/**
 * Byte ranges for media served from the service worker's cache.
 *
 * A <video> or <audio> element asks for `Range: bytes=…` and will not seek
 * (on some browsers, will not play at all) unless the answer is a proper
 * 206. Cache Storage stores the whole file, so the worker slices it here.
 * Same rules as the desktop app's tereco-media:// handler in desktop/main.js.
 *
 * Plain script, not a module: loaded by importScripts() in sw.js, and by
 * require() in the unit test.
 */
function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) return { unsatisfiable: true };
  return { start, end };
}

if (typeof module !== 'undefined') module.exports = { parseByteRange };
