'use client'

/**
 * Practical lab-skills scoring.
 *
 * ─── Why item-first ─────────────────────────────────────────────────────────
 * ~41 learners x 7 aspects is ~287 judgements per lesson. Shown learner-first —
 * one child, seven questions, forty-one times — that is twenty minutes of
 * misery and the teacher mass-selects to escape it. Shown item-first, the
 * teacher holds ONE skill in mind and scans the class: seven screens, not
 * forty-one, and each pass reads like a single question.
 *
 *   pass 0            pass 1                        pass 6
 *   ┌──────────┐      ┌──────────┐                  ┌──────────┐
 *   │ aspect 1 │ ───► │ aspect 2 │ ───►  ...  ───►   │ aspect 7 │ ───► complete
 *   │ 41 rows  │ ◄─── │ 41 rows  │ ◄───        ◄───  │ 41 rows  │
 *   └──────────┘      └──────────┘                  └──────────┘
 *        │                                                │
 *        └──── bulk-affirm remainder (per pass) ───────────┘
 *
 * ─── Why nothing is ever pre-selected ───────────────────────────────────────
 * lesson_reports learned this the expensive way: had_challenges came back 100%
 * false across 35 reports, not because nothing went wrong, but because ticking
 * the informative answer obligated a paragraph of prose while ticking the bland
 * one cost a single tap. The form charged a fee for honesty.
 *
 * So: no default band, no pre-checked control, and the bulk-affirm is a button
 * the teacher PRESSES with the count and the band written on it. The remainder
 * is an affirmed judgement, never the absence of one.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, CloudOff, Loader2, Search, RefreshCw } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthContext'
import { cn, ProgressPill } from '@/components/staff/wizardPrimitives'
import {
  PRACTICAL_ASPECTS,
  PRACTICAL_BANDS,
  type PracticalAspect,
  type PracticalBand,
} from '@/lib/entities/practical-observations'
import * as outbox from '@/lib/practical-outbox'

/** Mirrors ScorableSession, minus the fields this screen has no use for. */
interface Learner {
  lessonAttendanceId: string
  studentId: string
  systemId: string | null
  name: string
  bands: Partial<Record<PracticalAspect, PracticalBand>>
}

interface SessionView {
  sessionId: string
  sessionDate: string
  period: number
  scoredAt: string | null
  learners: Learner[]
}

/** Long enough that tapping down a class is one request, short enough to feel saved. */
const FLUSH_DELAY_MS = 900

export function PracticalScoringGrid({
  sessionId,
  onBack,
}: {
  sessionId: string
  onBack: () => void
}) {
  const { user } = useAuth()
  const staffId = user?.id ?? ''

  const [session, setSession] = useState<SessionView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pass, setPass] = useState(0)
  const [pendingCells, setPendingCells] = useState<outbox.Outbox>({})
  const [syncing, setSyncing] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')

  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aspect = PRACTICAL_ASPECTS[pass].code

  /**
   * The live outbox, readable synchronously.
   *
   * `pendingCells` drives rendering, but it is a value captured per render, so
   * anything that reads it AFTER an await sees the pre-await snapshot. That bug
   * was real and on the most likely path: complete() awaited flush(), then
   * checked the closed-over `pendingCells`, found it non-empty, and told the
   * teacher "Some scoring has not saved yet" on a flush that had just succeeded.
   * The ref is what makes a post-await read see what actually happened.
   */
  const pendingRef = useRef<outbox.Outbox>({})
  /** Guards against two flushes for the same aspect racing; the loser could persist an older band. */
  const flushing = useRef(false)

  /** Single place the outbox changes: state for render, ref for logic, storage for the power cut. */
  const commitOutbox = useCallback(
    (next: outbox.Outbox) => {
      pendingRef.current = next
      setPendingCells(next)
      outbox.write(staffId, sessionId, next)
    },
    [staffId, sessionId]
  )

  /* ── Load, then lay any unsynced taps over the top ─────────────────────── */
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/practical?sessionId=${encodeURIComponent(sessionId)}`)
        const body = await res.json()
        if (cancelled) return
        if (!res.ok || !body.success) {
          // Every route in this app returns { success, message } — see
          // lib/apiResponse.ts. Reading `error` here would silently swallow the
          // server's actual explanation and show the fallback for everything.
          setLoadError(body.message ?? 'Could not open this lesson.')
          return
        }
        setSession(body.data as SessionView)
        const restored = outbox.read(staffId, sessionId)
        pendingRef.current = restored
        setPendingCells(restored)
      } catch {
        if (!cancelled) setLoadError('Could not reach the server. Check your connection and try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (staffId) load()
    return () => {
      cancelled = true
    }
  }, [sessionId, staffId])

  /* ── The list the teacher sees: server state + unsynced taps ───────────── */
  const learners = useMemo(
    () => (session ? outbox.overlay(session.learners, pendingCells) : []),
    [session, pendingCells]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return learners
    return learners.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.systemId ?? '').toLowerCase().includes(q)
    )
  }, [learners, query])

  const scoredThisPass = learners.filter((l) => l.bands[aspect]).length
  const unscoredThisPass = learners.length - scoredThisPass
  const passComplete = learners.length > 0 && unscoredThisPass === 0
  const allPassesComplete =
    learners.length > 0 && PRACTICAL_ASPECTS.every((a) => learners.every((l) => l.bands[a.code]))
  const outstandingCells = outbox.size(pendingCells)

  /* ── Send one pass's pending taps ──────────────────────────────────────── */
  const flush = useCallback(async () => {
      // Always the live outbox, never a captured snapshot, and never two at once.
      // Without the guard, a second debounce firing while the first request is
      // open lets both POST the same aspect: whichever LANDS last wins rather
      // than whichever was TAPPED last, and a corrected band silently reverts.
      if (flushing.current) return
      const entries = outbox.pending(pendingRef.current)
      if (entries.length === 0) return
      flushing.current = true
      setSyncing(true)
      try {
        // Grouped by aspect: the server records a pass at a time, and a teacher
        // who steps back to an earlier aspect can have two in flight.
        const byAspect = new Map<PracticalAspect, outbox.PendingEntry[]>()
        for (const entry of entries) {
          byAspect.set(entry.aspect, [...(byAspect.get(entry.aspect) ?? []), entry])
        }

        const confirmed: outbox.PendingEntry[] = []
        let latest: SessionView | null = null
        for (const [aspectKey, group] of byAspect) {
          const res = await fetch('/api/practical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              action: 'save',
              aspect: aspectKey,
              entries: group.map((e) => ({
                lessonAttendanceId: e.lessonAttendanceId,
                band: e.band,
                // Carried through so the database can tell a decision about this
                // learner from one swept in with the remainder button. Nothing
                // else can distinguish them after the fact.
                source: e.source,
              })),
            }),
          })
          if (!res.ok) throw new Error('save failed')
          // The route returns the round as it now stands, and this used to throw
          // that away. Draining the outbox without it made every successful save
          // LOOK like a failure: the band was only on screen because the outbox
          // held it, so the instant the server confirmed, the overlay emptied and
          // fell back to the stale `session` — and the button went blank.
          const saved = await res.json()
          if (saved?.success && saved.data) latest = saved.data as SessionView
          confirmed.push(...group)
        }

        // Server state first, then drain. Both land in one React batch, so the
        // band never flickers between the two sources of truth.
        if (latest) setSession(latest)
        // Drain against the CURRENT outbox, not the snapshot we sent — a tap
        // made while the request was in flight must survive.
        commitOutbox(outbox.drain(pendingRef.current, confirmed))
        setSyncFailed(false)
      } catch {
        // Nothing is dropped. The taps stay in the outbox and go again on the
        // next tap, on Retry, or when the round is completed.
        setSyncFailed(true)
      } finally {
        flushing.current = false
        setSyncing(false)
      }
    },
    [sessionId, commitOutbox]
  )

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => void flush(), FLUSH_DELAY_MS)
  }, [flush])

  // Send on the way out, do not just cancel the timer. Leaving within the debounce
  // window used to defer those taps to localStorage indefinitely: the round stayed
  // incomplete, and the nightly reminder nagged about work the teacher believed
  // they had done.
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      if (outbox.size(pendingRef.current) > 0) void flush()
    },
    [flush]
  )

  /* ── Taps ──────────────────────────────────────────────────────────────── */
  function tap(lessonAttendanceId: string, band: PracticalBand) {
    // Side effects live here, not inside a setState updater. React may invoke an
    // updater more than once — StrictMode does so deliberately in dev — and a
    // double-invoked updater that also writes storage and arms a timer is a
    // source of duplicated work that is very hard to see.
    commitOutbox(
      outbox.stage(pendingRef.current, [{ lessonAttendanceId, aspect, band, source: 'tap' }])
    )
    scheduleFlush()
  }

  /**
   * "Mark the remaining 12 as Moderate."
   *
   * Staged as ordinary taps rather than sent as a server-side bulk action, so it
   * behaves identically offline and so a teacher can still correct any one of
   * them afterwards before the pass syncs. The count and the band are on the
   * button because this is a judgement being pressed, not a default being
   * accepted.
   */
  function affirmRemainder() {
    // `visible`, NOT `learners`. This used to sweep the whole class regardless of
    // the search box, so a teacher who filtered to two names, saw two rows, and
    // pressed a button reading "Mark the remaining 29 as Moderate" scored 29
    // learners they could not see, with no confirm and no undo.
    const remaining = visible.filter((l) => !l.bands[aspect])
    if (remaining.length === 0) return
    commitOutbox(
      outbox.stage(
        pendingRef.current,
        remaining.map((l) => ({
          lessonAttendanceId: l.lessonAttendanceId,
          aspect,
          band: 'moderate' as const,
          // Recorded as swept, not chosen. Without this the database cannot tell
          // seven presses of this button from 287 real observations.
          source: 'bulk' as const,
        }))
      )
    )
    scheduleFlush()
  }

  async function complete() {
    setCompleteError('')
    if (outstandingCells > 0) {
      // Completing with unsynced taps would have the server judge a round it
      // cannot see all of, and the teacher would get "missing aspects" when the
      // real answer is "still syncing" — which reads as work lost.
      if (flushTimer.current) clearTimeout(flushTimer.current)
      await flush()
      // Read the REF, not the render-time value. Checking `pendingCells` here
      // saw the pre-flush snapshot and reported failure on a flush that had just
      // succeeded — every time the last tap landed inside the debounce window.
      if (outbox.size(pendingRef.current) > 0) {
        setCompleteError('Some scoring has not saved yet. Reconnect and try again.')
        return
      }
    }
    setCompleting(true)
    try {
      const res = await fetch('/api/practical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'complete' }),
      })
      const body = await res.json()
      if (!res.ok || !body.success) {
        // completeRound refuses with what is actually still missing, e.g.
        // "Still to score: Helps others (12 left)." Surfacing it verbatim is the
        // whole point — a bare "incomplete" leaves the teacher hunting.
        setCompleteError(body.message ?? 'Could not finish this round.')
        return
      }
      pendingRef.current = {}
      setPendingCells({})
      outbox.clear(staffId, sessionId)
      setSession(body.data as SessionView)
    } catch {
      setCompleteError('Could not reach the server. Your scoring is saved on this device.')
    } finally {
      setCompleting(false)
    }
  }

  /* ── Render ────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#666666]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden />
        Opening the register…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <p className="text-sm text-[#C0392B] mb-4">{loadError}</p>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#02465B] cursor-pointer">
          Back to lessons
        </button>
      </div>
    )
  }

  if (!session) return null

  if (session.scoredAt) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-[#E8F7EF] flex items-center justify-center mx-auto mb-4">
          <Check className="w-6 h-6 text-[#1A7A4A]" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-[#171717] mb-1">Practical scoring complete</h2>
        <p className="text-sm text-[#666666] mb-6">
          {learners.length} learners, all {PRACTICAL_ASPECTS.length} skills. It now counts towards their
          practical score for the term.
        </p>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#02465B] cursor-pointer">
          Back to lessons
        </button>
      </div>
    )
  }

  if (learners.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <h2 className="text-lg font-semibold text-[#171717] mb-1">Nobody was marked present</h2>
        <p className="text-sm text-[#666666] mb-6">
          Practical skills are scored from the register, so there is nobody to score for this lesson.
        </p>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#02465B] cursor-pointer">
          Back to lessons
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to lessons"
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-[#F5F5F5] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#404040]" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#171717] truncate">
            Period {session.period} · {session.sessionDate}
          </p>
          <p className="text-xs text-[#A3A3A3]">{learners.length} learners present</p>
        </div>
        <SyncBadge syncing={syncing} failed={syncFailed} outstanding={outstandingCells} />
      </div>

      <ProgressPill current={pass} total={PRACTICAL_ASPECTS.length} />

      {/* Offline notice: never a modal, never disables the grid. The teacher
          keeps working; the outbox is what makes that safe. */}
      {syncFailed && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-[#FEF3DC] border border-[#F7D6A9] px-3 py-2.5">
          <CloudOff className="w-4 h-4 text-[#C47B0A] mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#C47B0A]">Working offline</p>
            <p className="text-xs text-[#C47B0A]/90">
              Your scoring is saved on this device and will sync when you reconnect.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void flush()}
            className="ml-auto shrink-0 text-xs font-semibold text-[#C47B0A] underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* The question for this pass */}
      <div className="mt-5 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#A3A3A3] mb-1">
          Skill {pass + 1} of {PRACTICAL_ASPECTS.length}
        </p>
        <h2 className="text-lg font-semibold text-[#171717] leading-snug">
          {PRACTICAL_ASPECTS[pass].label}
        </h2>
        <p className="text-sm text-[#666666] mt-1">
          {scoredThisPass} of {learners.length} scored
        </p>
      </div>

      {/* Search never touches scoring state — it filters the rendered list only,
          so a tap can never be lost by typing. */}
      <div className="relative mb-2">
        <Search className="w-4 h-4 text-[#A3A3A3] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ID…"
          aria-label="Search the roster by name or ID"
          className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] focus:bg-white focus:border-[#0489AE] focus:outline-none"
        />
      </div>

      {/* Roster */}
      <div role="group" aria-label={PRACTICAL_ASPECTS[pass].label}>
        {visible.map((learner) => (
          <BandRow
            key={learner.lessonAttendanceId}
            name={learner.name}
            systemId={learner.systemId}
            selected={learner.bands[aspect]}
            onPick={(band) => tap(learner.lessonAttendanceId, band)}
          />
        ))}
        {visible.length === 0 && (
          <p className="py-8 text-center text-sm text-[#A3A3A3]">No learner matches “{query}”.</p>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-[#EAEAEA] bg-white/95 backdrop-blur px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {unscoredThisPass > 0 && (
            <button
              type="button"
              onClick={affirmRemainder}
              className="w-full py-2.5 rounded-lg border border-[#E0E0E0] text-sm font-semibold text-[#404040] hover:bg-[#F5F5F5] cursor-pointer"
            >
              Mark the remaining {unscoredThisPass} as Moderate
            </button>
          )}

          {completeError && <p className="text-xs text-[#C0392B]">{completeError}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPass((p) => Math.max(0, p - 1))}
              disabled={pass === 0}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[#404040] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F5F5F5] cursor-pointer"
            >
              Back
            </button>

            {pass < PRACTICAL_ASPECTS.length - 1 ? (
              <button
                type="button"
                onClick={() => { setPass((p) => p + 1); setQuery('') }}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer',
                  passComplete
                    ? 'bg-[#02465B] text-white hover:bg-[#02303F]'
                    : 'bg-[#F5F5F5] text-[#404040] hover:bg-[#EAEAEA]'
                )}
              >
                {passComplete ? 'Next skill' : `Next skill (${unscoredThisPass} unscored)`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void complete()}
                disabled={!allPassesComplete || completing}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-[#02465B] text-white hover:bg-[#02303F] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {completing ? 'Finishing…' : 'Finish scoring'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   One learner, three bands. Nothing pre-selected.
───────────────────────────────────────────────── */
function BandRow({
  name,
  systemId,
  selected,
  onPick,
}: {
  name: string
  systemId: string | null
  selected: PracticalBand | undefined
  onPick: (band: PracticalBand) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-1 border-b border-[#EAEAEA] last:border-0">
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm truncate', selected ? 'text-[#171717] font-medium' : 'text-[#404040]')}>
          {name}
        </p>
        {systemId && <p className="text-xs text-[#A3A3A3]">{systemId}</p>}
      </div>
      <div className="flex gap-1 shrink-0" role="radiogroup" aria-label={`Band for ${name}`}>
        {PRACTICAL_BANDS.map((band) => {
          const active = selected === band.code
          return (
            <button
              key={band.code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPick(band.code)}
              title={band.label}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer',
                active
                  ? BAND_ACTIVE[band.code]
                  : 'bg-[#F5F5F5] text-[#666666] hover:bg-[#EAEAEA]'
              )}
            >
              {BAND_SHORT[band.code]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Abbreviated so three buttons fit a phone; the full label is the title and aria-label. */
const BAND_SHORT: Record<PracticalBand, string> = {
  outstanding: 'Outstanding',
  moderate: 'Moderate',
  needs_support: 'Needs support',
}

const BAND_ACTIVE: Record<PracticalBand, string> = {
  outstanding: 'bg-[#E8F7EF] text-[#1A7A4A]',
  moderate: 'bg-[#D6F0F7] text-[#02465B]',
  needs_support: 'bg-[#FEF3DC] text-[#C47B0A]',
}

function SyncBadge({
  syncing,
  failed,
  outstanding,
}: {
  syncing: boolean
  failed: boolean
  outstanding: number
}) {
  if (syncing) {
    return (
      <span className="shrink-0 flex items-center gap-1.5 text-xs text-[#A3A3A3]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        Saving
      </span>
    )
  }
  if (failed || outstanding > 0) {
    return (
      <span className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-[#C47B0A]">
        <RefreshCw className="w-3.5 h-3.5" aria-hidden />
        {outstanding} not saved
      </span>
    )
  }
  return (
    <span className="shrink-0 flex items-center gap-1.5 text-xs text-[#1A7A4A]">
      <Check className="w-3.5 h-3.5" aria-hidden />
      Saved
    </span>
  )
}
