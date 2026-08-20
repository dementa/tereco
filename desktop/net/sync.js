'use strict';

/**
 * Drains the local sync queue to Supabase when there is a network again.
 *
 * Runs in the Electron main process. Nothing here is reachable from the
 * renderer: a page that could trigger or fake a sync could also claim a paper
 * was uploaded when it was not.
 *
 * Deliberately free of Electron imports so it can be exercised under plain Node
 * — `fetchFn` is injected.
 */

/**
 * Backoff between attempts on a failing item, capped at ten minutes.
 *
 * Applied by the repository's claim query, not here: an item that is still
 * waiting is never offered, so it cannot be claimed and put back — which would
 * inflate its retry count for an attempt that never happened.
 */
const BACKOFF_MS = [0, 5_000, 30_000, 120_000, 600_000];

/**
 * Failures that will never succeed on retry.
 *
 * A rejected signature or a device mismatch is a permanent answer, and
 * retrying it forever would keep a lab machine reporting "not synchronised" for
 * work the server is never going to accept. It stays on disk and stays visible;
 * it just stops consuming attempts.
 */
const PERMANENT_STATUSES = new Set([400, 403, 404, 409, 422]);

function createSyncEngine({ baseUrl, repo, fetchFn, now = () => Date.now() }) {
  let running = false;
  let lastError = null;

  /**
   * Uploads one queued submission.
   *
   * @returns {'synced'|'failed'|'permanent'}
   */
  async function syncOne(item) {
    let response;
    try {
      response = await fetchFn(new URL('/api/sync/submission', baseUrl).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: item.token,
          attemptId: item.attemptId,
          deviceId: item.deviceId,
          answers: item.answers,
          timeSpentSeconds: item.timeSpentSeconds,
          submittedAt: item.submittedAt,
        }),
      });
    } catch (err) {
      // No network, DNS failure, connection reset. Always worth another go.
      repo.markFailed(item.queueId, err?.message ?? 'Network error');
      lastError = err?.message ?? 'Network error';
      return 'failed';
    }

    const body = await response.json().catch(() => null);

    /**
     * `synced` is set only here, on a confirming response.
     *
     * A 2xx that does not carry `success: true` is not a confirmation — it
     * could be a proxy's error page or a captive portal, and marking work
     * synchronised on the strength of a status code is how a paper gets
     * quietly lost.
     */
    if (response.ok && body?.success === true) {
      repo.markSynced(item.queueId);
      return 'synced';
    }

    const message = body?.message ?? `HTTP ${response.status}`;
    repo.markFailed(item.queueId, message);
    lastError = message;

    return PERMANENT_STATUSES.has(response.status) ? 'permanent' : 'failed';
  }

  /**
   * Works through everything outstanding.
   *
   * One at a time and oldest first: a lab of fifty machines reconnecting at once
   * is already the hard case for this school's connection, and a machine that
   * opened a request per queued paper would make it worse.
   *
   * `force` skips each item's backoff cooldown. It exists for two callers: the
   * "Sync now" button, where a person standing at the machine has already done
   * the waiting the backoff exists to enforce, and the moment the machine's
   * network comes back, where every outstanding item deserves an immediate
   * attempt rather than however much of its old cooldown is left over from
   * when the link was down.
   */
  async function drain({ maxItems = 100, force = false } = {}) {
    if (running) return { skipped: true, ...repo.syncStatus() };
    running = true;
    lastError = null;

    let synced = 0;
    let failed = 0;

    try {
      for (let i = 0; i < maxItems; i += 1) {
        // Anything still inside its backoff window is not offered, so an empty
        // claim means "nothing to do right now", not "nothing left" — unless
        // `force` is set, in which case the backoff window is not consulted.
        const item = repo.claimNext(now(), { ignoreBackoff: force });
        if (!item) break;

        const outcome = await syncOne(item);
        if (outcome === 'synced') synced += 1;
        else failed += 1;
        if (outcome === 'permanent') break;
      }
    } finally {
      running = false;
    }

    return { synced, failed, ...repo.syncStatus(), lastError };
  }

  function status() {
    return { ...repo.syncStatus(), lastError };
  }

  return { drain, status, syncOne, get running() { return running; }, now };
}

module.exports = { createSyncEngine, BACKOFF_MS, PERMANENT_STATUSES };
