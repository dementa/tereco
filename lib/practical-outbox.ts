import type {
  ObservationSource,
  PracticalAspect,
  PracticalBand,
} from "@/lib/entities/practical-observations";

/**
 * Unsynced practical scoring, held on the device until the server confirms it.
 *
 * An OUTBOX, not a cache. It holds only taps that have NOT reached the server,
 * which is what removes conflict resolution entirely: anything in here is newer
 * than the server by definition, so it always wins on merge and there is no
 * stale-copy class of bug to reason about. It also drains itself, so it cannot
 * grow without bound on a shared staffroom machine.
 *
 * localStorage rather than sessionStorage, for the reason AssessmentTake.tsx:48
 * records: sessionStorage is erased when the browser session ends, and a power
 * cut ends it. That failure once wiped a whole room of learners' answers.
 *
 * The key carries BOTH the staff id and the session id. localStorage does not
 * die with the tab, so on a shared school computer a teacher scoring P.7 Green
 * would otherwise have the previous teacher's P.5 Blue bands restored into their
 * roster. Same hazard AssessmentTake.tsx:55 documents for learners.
 *
 * Everything below the IO boundary is pure, so the merge and drain rules can be
 * tested without a DOM once Vitest lands (T3).
 */

/**
 * lessonAttendanceId -> aspect -> the cell, for cells not yet confirmed.
 *
 * A cell is band + source, not a bare band: `source` has to survive the round
 * trip through localStorage, or a bulk-filled remainder replayed after a power
 * cut would come back looking like 41 individual judgements.
 */
export type Cell = { band: PracticalBand; source: ObservationSource };
export type Outbox = Record<string, Partial<Record<PracticalAspect, Cell>>>;

export interface PendingEntry {
  lessonAttendanceId: string;
  aspect: PracticalAspect;
  band: PracticalBand;
  source: ObservationSource;
}

// ─── Pure ───────────────────────────────────────────────────────────────────

/** Add or replace taps. A re-tap of the same cell overwrites — the later tap is the teacher's intent. */
export function stage(outbox: Outbox, entries: PendingEntry[]): Outbox {
  const next: Outbox = { ...outbox };
  for (const entry of entries) {
    next[entry.lessonAttendanceId] = {
      ...next[entry.lessonAttendanceId],
      [entry.aspect]: { band: entry.band, source: entry.source },
    };
  }
  return next;
}

/**
 * Remove cells the server has confirmed.
 *
 * Drains only the exact (learner, aspect, band) triples that were sent. A cell
 * re-tapped while the request was in flight has a different band by the time the
 * response lands, so it stays pending and gets sent again — which is correct.
 * Draining by key alone would silently discard that newer tap.
 */
export function drain(outbox: Outbox, confirmed: PendingEntry[]): Outbox {
  const next: Outbox = {};
  for (const [attendanceId, aspects] of Object.entries(outbox)) {
    const remaining: Partial<Record<PracticalAspect, Cell>> = {};
    for (const [aspect, cell] of Object.entries(aspects) as [PracticalAspect, Cell][]) {
      const wasConfirmed = confirmed.some(
        (c) => c.lessonAttendanceId === attendanceId && c.aspect === aspect && c.band === cell.band
      );
      if (!wasConfirmed) remaining[aspect] = cell;
    }
    if (Object.keys(remaining).length > 0) next[attendanceId] = remaining;
  }
  return next;
}

/** Everything still waiting to reach the server, flattened for sending. */
export function pending(outbox: Outbox): PendingEntry[] {
  return Object.entries(outbox).flatMap(([lessonAttendanceId, aspects]) =>
    (Object.entries(aspects) as [PracticalAspect, Cell][]).map(([aspect, cell]) => ({
      lessonAttendanceId,
      aspect,
      band: cell.band,
      source: cell.source,
    }))
  );
}

/** Just those for one aspect — a pass is sent as a unit. */
export function pendingForAspect(outbox: Outbox, aspect: PracticalAspect): PendingEntry[] {
  return pending(outbox).filter((e) => e.aspect === aspect);
}

export function size(outbox: Outbox): number {
  return pending(outbox).length;
}

/**
 * Server state with unsynced taps laid over the top.
 *
 * The overlay always wins. That is the whole point of an outbox: if a cell is
 * still in here, the server has not acknowledged it, so the device holds the
 * newer value.
 */
export function overlay<T extends { lessonAttendanceId: string; bands: Partial<Record<PracticalAspect, PracticalBand>> }>(
  learners: T[],
  outbox: Outbox
): T[] {
  return learners.map((learner) => {
    const staged = outbox[learner.lessonAttendanceId];
    if (!staged) return learner;
    const bands = { ...learner.bands };
    for (const [aspect, cell] of Object.entries(staged) as [PracticalAspect, Cell][]) {
      bands[aspect] = cell.band;
    }
    return { ...learner, bands };
  });
}

// ─── Storage ────────────────────────────────────────────────────────────────

export function outboxKey(staffId: string, sessionId: string): string {
  return `tereco_practical_${staffId}_${sessionId}`;
}

/**
 * Every access is guarded. localStorage throws in private-browsing modes and is
 * simply absent during server rendering, and neither is a reason to lose the
 * teacher's screen — a failure here degrades to "no offline safety net", not to
 * a crash mid-round.
 */
export function read(staffId: string, sessionId: string): Outbox {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(outboxKey(staffId, sessionId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Outbox;
  } catch {
    return {};
  }
}

export function write(staffId: string, sessionId: string, outbox: Outbox): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(outbox).length === 0) {
      window.localStorage.removeItem(outboxKey(staffId, sessionId));
      return;
    }
    window.localStorage.setItem(outboxKey(staffId, sessionId), JSON.stringify(outbox));
  } catch {
    // Quota exceeded or storage disabled. The round still works; it just loses
    // its safety net, which the banner already tells the teacher about.
  }
}

export function clear(staffId: string, sessionId: string): void {
  write(staffId, sessionId, {});
}
