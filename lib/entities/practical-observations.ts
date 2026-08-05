import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";
import { getCurrentTermId } from "@/lib/entities/performance";

/**
 * Practical lab-skills observation: a teacher's judgement of every present
 * learner on seven observable skills, in three bands, contributing to the
 * learner's performance alongside their written assessment average.
 *
 * The round hangs off attendance_sessions rather than a container of its own —
 * see the reasoning at the top of 21-practical-observations.sql. The short
 * version: attendance_sessions already IS that container, and reusing it makes
 * the roster to score the roster marked present, so "can an absent learner be
 * scored" is a foreign key instead of a design question.
 *
 * Two invariants live in the database, not here, because client-side validation
 * is one curl away from bypass:
 *   - a learner marked absent cannot be scored (trg_validate_practical_present)
 *   - a round in a closed term is read-only  (trg_validate_practical_term_open)
 * This module surfaces both as user-facing messages rather than duplicating the
 * checks and letting the two drift.
 */

// ─── The rubric ─────────────────────────────────────────────────────────────

/**
 * Codes are stored; sentences are not. This map is the ONLY place a teacher-
 * facing wording lives, which is what makes the change most likely to be asked
 * for — rewording an aspect — cost one string and touch no data. Every
 * historical score stays valid and comparable, because the code never moved.
 *
 * `works_without_support` was originally specified as "requires support from the
 * teacher most of the time". Stored that way it ran opposite in polarity to the
 * other six: averaged naively, a learner needing constant help would have scored
 * HIGHER, and the number would have looked entirely normal. It was also
 * unanswerable at capture — "requires support most of the time: Outstanding" is
 * not something a teacher can press with confidence, and two teachers would have
 * guessed in opposite directions. Inverted so all seven point the same way.
 */
export const PRACTICAL_ASPECTS = [
  { code: "uses_lab_properly", label: "Uses the lab properly" },
  { code: "types_two_hands", label: "Types using two hands" },
  { code: "maintains_order", label: "Maintains order while in class" },
  { code: "navigates_independently", label: "Navigates the computer independently" },
  { code: "works_without_support", label: "Works independently without needing teacher support" },
  { code: "helps_others", label: "Helps others when they are stuck" },
  { code: "finishes_on_time", label: "Finishes work in time" },
] as const;

export type PracticalAspect = (typeof PRACTICAL_ASPECTS)[number]["code"];

/**
 * Bands, in the order a teacher reads them. Three rather than a seven-point
 * scale because three is what is actually perceived across forty learners: the
 * standouts, the strugglers, and the majority who are fine.
 *
 * "needs_support" rather than "challenged": this label reaches a report a parent
 * reads, and "challenged" states a verdict about the child where "needs support"
 * states an obligation of the school.
 */
export const PRACTICAL_BANDS = [
  { code: "outstanding", label: "Outstanding" },
  { code: "moderate", label: "Moderate" },
  { code: "needs_support", label: "Needs support" },
] as const;

export type PracticalBand = (typeof PRACTICAL_BANDS)[number]["code"];

/**
 * Bump this whenever the aspect set changes — added, removed, or swapped.
 *
 * A completed round records the version it was judged against, so it stays
 * complete permanently no matter how the rubric evolves. Without it, adding an
 * eighth aspect would retroactively make every prior round seven-of-eight, and
 * a whole term of practical scores would silently drop out of every report with
 * nothing to explain why.
 *
 * A count would not be enough: swapping one aspect for another keeps the count
 * at seven while changing what was measured.
 */
export const CURRENT_RUBRIC_VERSION = 1;

/**
 * Which aspects a given rubric version requires.
 *
 * Only version 1 exists today, so this is trivial. It is a function rather than
 * a constant because the completeness gate must judge a round against the
 * version it was STARTED under, never against whatever is current — otherwise a
 * teacher who begins under v1 and finishes after v2 ships holds seven aspects
 * against a gate demanding eight, and their work is permanently stuck.
 */
export function aspectsForVersion(version: number): readonly PracticalAspect[] {
  if (version === CURRENT_RUBRIC_VERSION) return PRACTICAL_ASPECTS.map((a) => a.code);
  throw new UserFacingError(`Unknown practical rubric version ${version}.`, 500);
}

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface ScorableLearner {
  /** The row this learner's observations point at. The scoring unit, not student_id. */
  lessonAttendanceId: string;
  studentId: string;
  systemId: string | null;
  name: string;
  /** Bands recorded so far. Absent keys are aspects not yet scored. */
  bands: Partial<Record<PracticalAspect, PracticalBand>>;
}

export interface ScorableSession {
  sessionId: string;
  sessionDate: string;
  period: number;
  /** Null until the school defines the term containing this date; reconcile_terms() backfills it. */
  termId: string | null;
  /** Non-null once the round is complete. Aggregation reads complete rounds and nothing else. */
  scoredAt: string | null;
  /** The version this round is judged against — recorded at start, current until then. */
  rubricVersion: number;
  learners: ScorableLearner[];
  /** How many present learners have a band for each aspect. Drives the pass indicator. */
  progress: Record<PracticalAspect, number>;
  /** True when every present learner has every required aspect. */
  complete: boolean;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Everything the scoring screen needs, in two queries rather than one per
 * learner. Present learners only: an absent learner is not scoreable, and the
 * database will refuse the write anyway, so never offer the row.
 *
 * Ownership is checked here rather than relying on the caller filtering a list —
 * a filtered list still leaves this function reachable by id, the same reasoning
 * canManageAssessment carries in lib/auth/access.ts.
 */
export async function getScorableSession(
  sessionId: string,
  staffId: string
): Promise<ScorableSession> {
  const supabase = getSupabaseAdmin();

  const { data: session, error: sessionError } = await supabase
    .from("attendance_sessions")
    .select("id, staff_id, session_date, period, term_id, practical_scored_at, practical_rubric_version")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    // Logged, not returned: the raw message carries table and column names that
    // have no business reaching a browser.
    console.error("Could not load attendance session:", sessionError.message);
    throw new Error(sessionError.message);
  }
  if (!session) throw new UserFacingError("That lesson could not be found.", 404);
  if (session.staff_id !== staffId) {
    throw new UserFacingError("That lesson belongs to another teacher.", 403);
  }

  const { data: attendance, error: attendanceError } = await supabase
    .from("lesson_attendance")
    .select(
      "id, student_id, student:profiles!lesson_attendance_student_id_fkey(system_id, first_name, middle_name, last_name)"
    )
    .eq("attendance_session_id", sessionId)
    .eq("is_present", true);

  if (attendanceError) {
    console.error("Could not load the register:", attendanceError.message);
    throw new Error(attendanceError.message);
  }

  const rows = (attendance ?? []) as unknown as AttendanceRow[];
  const attendanceIds = rows.map((r) => r.id);

  const observations = attendanceIds.length ? await fetchObservations(attendanceIds) : [];
  const bandsByAttendance = new Map<string, Partial<Record<PracticalAspect, PracticalBand>>>();
  for (const o of observations) {
    const existing = bandsByAttendance.get(o.lesson_attendance_id) ?? {};
    existing[o.aspect] = o.band;
    bandsByAttendance.set(o.lesson_attendance_id, existing);
  }

  const learners: ScorableLearner[] = rows
    .map((row) => ({
      lessonAttendanceId: row.id,
      studentId: row.student_id,
      systemId: row.student?.system_id ?? null,
      name: fullName(row.student),
      bands: bandsByAttendance.get(row.id) ?? {},
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rubricVersion = session.practical_rubric_version ?? CURRENT_RUBRIC_VERSION;
  const required = aspectsForVersion(rubricVersion);

  const progress = Object.fromEntries(
    required.map((aspect) => [aspect, learners.filter((l) => l.bands[aspect]).length])
  ) as Record<PracticalAspect, number>;

  return {
    sessionId: session.id,
    sessionDate: session.session_date,
    period: session.period,
    termId: session.term_id,
    scoredAt: session.practical_scored_at,
    rubricVersion,
    learners,
    progress,
    // A round with nobody present is not complete, it is empty. Guarding here
    // stops an all-absent lesson from being marked scored and then contributing
    // a practical score built on no observations at all.
    complete: learners.length > 0 && required.every((a) => progress[a] === learners.length),
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export interface BandEntry {
  lessonAttendanceId: string;
  band: PracticalBand;
}

/**
 * Record one pass: the teacher's explicit taps for a single aspect across the
 * class. Entry is item-first (one aspect, all learners) rather than one learner
 * at a time — a teacher holding a single skill in mind scans a class quickly,
 * where holding seven skills per child is what makes 287 judgements unbearable.
 *
 * Upserts, so a re-tap and a retry-after-network-failure are the same safe
 * operation. That is what lets the client hold unsynced taps in a localStorage
 * outbox and replay them without having to reason about what already landed.
 */
export async function saveObservations(input: {
  sessionId: string;
  staffId: string;
  aspect: PracticalAspect;
  entries: BandEntry[];
}): Promise<void> {
  if (input.entries.length === 0) return;

  const session = await getScorableSession(input.sessionId, input.staffId);
  const scorable = new Set(session.learners.map((l) => l.lessonAttendanceId));

  for (const entry of input.entries) {
    if (!scorable.has(entry.lessonAttendanceId)) {
      // Not an authorisation failure — almost always a learner marked absent
      // after the teacher opened the screen. Say so plainly.
      throw new UserFacingError(
        "One of those learners is no longer marked present for this lesson. Refresh and try again.",
        409
      );
    }
  }

  await stampRubricVersion(input.sessionId);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("practical_observations").upsert(
    input.entries.map((e) => ({
      lesson_attendance_id: e.lessonAttendanceId,
      aspect: input.aspect,
      band: e.band,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "lesson_attendance_id,aspect" }
  );

  if (error) throw translateWriteError(error);
}

/**
 * The "the remaining 29 were Moderate" action.
 *
 * Inserts for learners with no band yet on this aspect and NEVER touches one the
 * teacher has already tapped — an explicit judgement always beats a bulk default.
 * That ordering is why this is a plain insert rather than an upsert, and why a
 * unique-violation from a concurrent tap is swallowed rather than retried: the
 * tap won, which is the correct outcome.
 *
 * The point of this action is that the remainder is a judgement the teacher
 * PRESSED, not the absence of one. lesson_reports learned this the hard way —
 * had_challenges came back 100% false across 35 reports because ticking the
 * informative answer cost a paragraph of prose and ticking the bland one cost a
 * tap. Nothing here may ever default silently on the teacher's behalf.
 */
export async function bulkAffirmRemainder(input: {
  sessionId: string;
  staffId: string;
  aspect: PracticalAspect;
  band: PracticalBand;
}): Promise<{ filled: number }> {
  const session = await getScorableSession(input.sessionId, input.staffId);
  const remaining = session.learners.filter((l) => !l.bands[input.aspect]);
  if (remaining.length === 0) return { filled: 0 };

  await stampRubricVersion(input.sessionId);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("practical_observations")
    .upsert(
      remaining.map((l) => ({
        lesson_attendance_id: l.lessonAttendanceId,
        aspect: input.aspect,
        band: input.band,
      })),
      { onConflict: "lesson_attendance_id,aspect", ignoreDuplicates: true }
    )
    .select("id");

  if (error) throw translateWriteError(error);
  return { filled: data?.length ?? 0 };
}

/**
 * Close the round: mark it counted.
 *
 * Saved and counted are deliberately different things. Item-first entry means a
 * teacher interrupted after pass three leaves three aspects filled for forty
 * learners, and that partial state is legitimate and must persist. Counting it
 * would compare a class scored on three aspects against a class scored on seven,
 * which are not the same measurement, and both produce a normal-looking number.
 *
 * Refuses with what is actually missing rather than a bare "incomplete", because
 * the teacher's next question is always "missing what?".
 */
export async function completeRound(sessionId: string, staffId: string): Promise<ScorableSession> {
  const session = await getScorableSession(sessionId, staffId);

  if (session.learners.length === 0) {
    throw new UserFacingError(
      "Nobody was marked present for this lesson, so there is nothing to score.",
      409
    );
  }

  if (!session.complete) {
    const required = aspectsForVersion(session.rubricVersion);
    const missing = required
      .filter((aspect) => session.progress[aspect] < session.learners.length)
      .map((aspect) => {
        const label = PRACTICAL_ASPECTS.find((a) => a.code === aspect)?.label ?? aspect;
        return `${label} (${session.learners.length - session.progress[aspect]} left)`;
      });
    throw new UserFacingError(`Still to score: ${missing.join(", ")}.`, 409);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("attendance_sessions")
    .update({
      practical_scored_at: new Date().toISOString(),
      practical_rubric_version: session.rubricVersion,
    })
    .eq("id", sessionId);

  if (error) throw translateWriteError(error);
  return getScorableSession(sessionId, staffId);
}

// ─── Aggregation ────────────────────────────────────────────────────────────

/**
 * A band as a number, so a set of judgements can be averaged.
 *
 * Evenly spaced on purpose. Any other spacing encodes a claim about how much
 * better "outstanding" is than "moderate" that nobody has evidence for, and it
 * would be invisible in the output — the score would just be quietly wrong in a
 * direction no one chose.
 */
const BAND_SCORE: Record<PracticalBand, number> = {
  outstanding: 100,
  moderate: 50,
  needs_support: 0,
};

/**
 * Complete rounds a learner needs in a term before a practical score is shown
 * at all.
 *
 * Below this they get "not enough observations yet" rather than a number, the
 * same instinct isRankable already carries in performance.ts: refusing to rank
 * an unmarked submission beats showing a confident figure built on nothing. Two
 * observations of a child is an anecdote, and putting an anecdote on a report
 * next to a written average built from four marked papers invites it to be read
 * as equally solid.
 *
 * Three is a starting point, not a finding. Revisit it once a term of real
 * distributions exists — it is a product decision, not a technical one.
 */
export const MINIMUM_ROUNDS = 3;

export interface PracticalAspectRate {
  aspect: PracticalAspect;
  label: string;
  outstanding: number;
  moderate: number;
  needsSupport: number;
  observations: number;
  /** 0-100, the mean of this aspect's bands. */
  score: number;
}

export interface PracticalTermScore {
  studentId: string;
  studentName: string;
  systemId: string | null;
  /** Complete rounds this learner was scored in. The denominator that makes a rate meaningful. */
  roundsScored: number;
  observations: number;
  /**
   * 0-100, or null when roundsScored < MINIMUM_ROUNDS. Null means "not enough
   * observations yet" and must be rendered as those words, never as 0.
   */
  score: number | null;
  perAspect: PracticalAspectRate[];
  /** Rubric versions contributing. More than one means the rubric changed mid-term. */
  rubricVersions: number[];
}

export interface PracticalScopeParams {
  termId: string;
  classId?: string;
  streamId?: string;
  /** Narrows to one learner. Still three queries, not a class-wide scan. */
  studentId?: string;
}

/**
 * Practical scores for a whole scope, in three queries regardless of how many
 * learners are in it.
 *
 * ⚠ NEVER call this once per learner. That is the trap this shape exists to
 * avoid: practical_observations will be the largest table here (~116k rows per
 * term against 1,436 in lesson_attendance today), and a per-learner helper in a
 * loop is 41 round trips against it for a single class view. Pass a scope and
 * group the result, the same way queryLeaderboard does in performance.ts. Use
 * the studentId filter for a single learner rather than filtering the output.
 *
 * Three queries rather than one deeply-nested embed: the filters that matter
 * (term_id, practical_scored_at) live two relations above the observations, and
 * each of these three maps directly onto an index created in
 * 21-practical-observations.sql. A single nested-filter query would be shorter
 * to write and considerably harder to be sure of.
 *
 * ─── Why per aspect, and not one average over every observation ─────────────
 *
 *   observations ──group by aspect──► rate per aspect ──mean──► practical score
 *
 * The overall score is the mean of the seven ASPECT scores, not the mean of all
 * observations. The two differ whenever aspects have unequal observation counts,
 * and that is exactly what a mid-term rubric change produces. Averaging over
 * observations would let the six aspects a learner was scored on most often
 * drown out the seventh; averaging the aspect rates keeps every aspect weighted
 * equally and lets two learners on different rubric versions still be compared
 * on the aspects they share.
 *
 * It is also what badges read later: "Peer Helper" is one aspect's rate, already
 * computed here, with no second migration and no backfill that could not be done.
 */
export async function getPracticalTermScores(
  params: PracticalScopeParams
): Promise<PracticalTermScore[]> {
  const supabase = getSupabaseAdmin();

  // 1. Complete rounds in scope. Incomplete rounds are excluded here rather than
  //    filtered later — a class scored on three aspects and a class scored on
  //    seven are not the same measurement, and both produce a normal-looking
  //    number, so a partial round must never reach the arithmetic at all.
  let sessionQuery = supabase
    .from("attendance_sessions")
    .select("id, practical_rubric_version")
    .eq("term_id", params.termId)
    .not("practical_scored_at", "is", null);

  if (params.classId) sessionQuery = sessionQuery.eq("class_id", params.classId);
  if (params.streamId) sessionQuery = sessionQuery.eq("stream_id", params.streamId);

  const { data: sessionRows, error: sessionError } = await sessionQuery;
  if (sessionError) {
    console.error("Could not load scored practical rounds:", sessionError.message);
    throw new Error(sessionError.message);
  }

  const sessions = (sessionRows ?? []) as unknown as { id: string; practical_rubric_version: number | null }[];
  if (sessions.length === 0) return [];

  const versionBySession = new Map(sessions.map((s) => [s.id, s.practical_rubric_version]));

  // 2. Who was present in those rounds.
  let attendanceQuery = supabase
    .from("lesson_attendance")
    .select(
      "id, student_id, attendance_session_id, student:profiles!lesson_attendance_student_id_fkey(system_id, first_name, middle_name, last_name)"
    )
    .in("attendance_session_id", Array.from(versionBySession.keys()))
    .eq("is_present", true);

  if (params.studentId) attendanceQuery = attendanceQuery.eq("student_id", params.studentId);

  const { data: attendanceRows, error: attendanceError } = await attendanceQuery;
  if (attendanceError) {
    console.error("Could not load registers for practical scoring:", attendanceError.message);
    throw new Error(attendanceError.message);
  }

  const attendance = (attendanceRows ?? []) as unknown as ScopedAttendanceRow[];
  if (attendance.length === 0) return [];

  // 3. The observations themselves.
  const observations = await fetchObservations(attendance.map((a) => a.id));
  const bandsByAttendance = new Map<string, ObservationRow[]>();
  for (const o of observations) {
    const list = bandsByAttendance.get(o.lesson_attendance_id) ?? [];
    list.push(o);
    bandsByAttendance.set(o.lesson_attendance_id, list);
  }

  const byStudent = new Map<string, StudentAccumulator>();
  for (const row of attendance) {
    const rows = bandsByAttendance.get(row.id);
    if (!rows || rows.length === 0) continue;

    const acc =
      byStudent.get(row.student_id) ??
      {
        name: fullName(row.student),
        systemId: row.student?.system_id ?? null,
        rounds: 0,
        versions: new Set<number>(),
        bands: new Map<PracticalAspect, PracticalBand[]>(),
      };

    acc.rounds += 1;
    const version = versionBySession.get(row.attendance_session_id);
    if (version != null) acc.versions.add(version);
    for (const o of rows) {
      const list = acc.bands.get(o.aspect) ?? [];
      list.push(o.band);
      acc.bands.set(o.aspect, list);
    }
    byStudent.set(row.student_id, acc);
  }

  const scores = Array.from(byStudent.entries()).map(([studentId, acc]) => {
    const perAspect: PracticalAspectRate[] = Array.from(acc.bands.entries())
      .map(([aspect, bands]) => ({
        aspect,
        label: PRACTICAL_ASPECTS.find((a) => a.code === aspect)?.label ?? aspect,
        outstanding: bands.filter((b) => b === "outstanding").length,
        moderate: bands.filter((b) => b === "moderate").length,
        needsSupport: bands.filter((b) => b === "needs_support").length,
        observations: bands.length,
        score: round1(bands.reduce((sum, b) => sum + BAND_SCORE[b], 0) / bands.length),
      }))
      // Rubric order, not alphabetical or score order — the report should read
      // in the same sequence the teacher scored in.
      .sort(
        (a, b) =>
          PRACTICAL_ASPECTS.findIndex((x) => x.code === a.aspect) -
          PRACTICAL_ASPECTS.findIndex((x) => x.code === b.aspect)
      );

    return {
      studentId,
      studentName: acc.name,
      systemId: acc.systemId,
      roundsScored: acc.rounds,
      observations: perAspect.reduce((sum, a) => sum + a.observations, 0),
      score:
        acc.rounds >= MINIMUM_ROUNDS && perAspect.length > 0
          ? round1(perAspect.reduce((sum, a) => sum + a.score, 0) / perAspect.length)
          : null,
      perAspect,
      rubricVersions: Array.from(acc.versions).sort((a, b) => a - b),
    };
  });

  // Sorted by name, deliberately unranked. Assigning a position here would make
  // it far too easy for one to reach a learner's own screen, and students must
  // never be shown their standing against classmates — see the comments on
  // getTopPerformersForStudent in lib/entities/performance.ts.
  return scores.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

/**
 * One learner's practical standing for a term, for their own report.
 *
 * Resolves the term with getCurrentTermId rather than comparing dates again
 * here. That function already mirrors term_for_date()'s containment rule and is
 * the third place term resolution lives; making it a fourth was the whole point
 * of putting term_id on attendance_sessions in the first place.
 *
 * Returns null when the school has no term covering today, rather than guessing
 * at the nearest one. A school that has not defined its terms should show no
 * practical standing, not a fabricated one — the same call getStudentTermAverages
 * makes when a submission falls outside every defined term.
 */
export async function getPracticalTermScoreForStudent(
  studentId: string,
  termId?: string
): Promise<PracticalTermScore | null> {
  let term = termId;

  if (!term) {
    const supabase = getSupabaseAdmin();
    const { data: enrollment, error } = await supabase
      .from("current_enrollments")
      .select("school_id")
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) {
      console.error("Could not resolve the learner's school:", error.message);
      throw new Error(error.message);
    }
    if (!enrollment?.school_id) return null;

    const resolved = await getCurrentTermId(enrollment.school_id);
    if (!resolved) return null;
    term = resolved;
  }

  const scores = await getPracticalTermScores({ termId: term, studentId });
  return scores[0] ?? null;
}

// ─── Reminders ──────────────────────────────────────────────────────────────

export interface PendingRound {
  sessionId: string;
  sessionDate: string;
  period: number;
  learners: number;
}

export interface PracticalReminder {
  staffId: string;
  name: string;
  email: string | null;
  rounds: PendingRound[];
}

/**
 * Teachers with lessons where they took the register but never finished scoring
 * practical skills.
 *
 * Three exclusions, each of which would otherwise produce a nudge nobody can act
 * on — and a reminder that cannot be cleared is one that gets ignored for good:
 *
 *   - today's lessons. A round is not overdue an hour after the bell, and
 *     scoring happens after the lesson by design.
 *   - rounds with nobody present. completeRound refuses these outright, so they
 *     can never be cleared and would nag forever.
 *   - rounds whose term has closed. Observations are frozen then
 *     (trg_validate_practical_term_open), so the work is no longer possible.
 *     A session with no term at all is still included — that school simply has
 *     not defined its calendar yet, and the work remains doable.
 */
export async function listPracticalReminders(): Promise<PracticalReminder[]> {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("attendance_sessions")
    .select(
      "id, staff_id, session_date, period, " +
        "staff:profiles!attendance_sessions_staff_id_fkey(first_name, middle_name, last_name, email), " +
        "term:terms(ends_on)"
    )
    .is("practical_scored_at", null)
    .lt("session_date", today)
    .order("session_date", { ascending: true });

  if (error) {
    console.error("Could not list pending practical rounds:", error.message);
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as ReminderSessionRow[];
  const open = rows.filter((row) => !row.term?.ends_on || row.term.ends_on >= today);
  if (open.length === 0) return [];

  // One query for the head-counts rather than one per round: this runs nightly
  // across every school, and the whole point of the index added in
  // 22-practical-reminders.sql is that it stays a small, bounded amount of work.
  const { data: presentRows, error: presentError } = await supabase
    .from("lesson_attendance")
    .select("attendance_session_id")
    .in("attendance_session_id", open.map((r) => r.id))
    .eq("is_present", true);

  if (presentError) {
    console.error("Could not count present learners:", presentError.message);
    throw new Error(presentError.message);
  }

  const presentCount = new Map<string, number>();
  for (const row of (presentRows ?? []) as { attendance_session_id: string }[]) {
    presentCount.set(
      row.attendance_session_id,
      (presentCount.get(row.attendance_session_id) ?? 0) + 1
    );
  }

  const byStaff = new Map<string, PracticalReminder>();
  for (const row of open) {
    const learners = presentCount.get(row.id) ?? 0;
    if (learners === 0) continue;

    const reminder =
      byStaff.get(row.staff_id) ??
      {
        staffId: row.staff_id,
        name: fullName(row.staff) || "Teacher",
        email: row.staff?.email ?? null,
        rounds: [],
      };
    reminder.rounds.push({
      sessionId: row.id,
      sessionDate: row.session_date,
      period: row.period,
      learners,
    });
    byStaff.set(row.staff_id, reminder);
  }

  return Array.from(byStaff.values()).sort((a, b) => b.rounds.length - a.rounds.length);
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface ReminderSessionRow {
  id: string;
  staff_id: string;
  session_date: string;
  period: number;
  staff: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    email: string | null;
  } | null;
  term: { ends_on: string } | null;
}

interface ScopedAttendanceRow extends AttendanceRow {
  attendance_session_id: string;
}

interface StudentAccumulator {
  name: string;
  systemId: string | null;
  rounds: number;
  versions: Set<number>;
  bands: Map<PracticalAspect, PracticalBand[]>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface AttendanceRow {
  id: string;
  student_id: string;
  student: {
    system_id: string | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
  } | null;
}

interface ObservationRow {
  lesson_attendance_id: string;
  aspect: PracticalAspect;
  band: PracticalBand;
}

async function fetchObservations(attendanceIds: string[]): Promise<ObservationRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("practical_observations")
    .select("lesson_attendance_id, aspect, band")
    .in("lesson_attendance_id", attendanceIds);

  if (error) {
    console.error("Could not load practical observations:", error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as ObservationRow[];
}

/**
 * Record which rubric the round is being judged against, once, at the moment the
 * first observation is written.
 *
 * Conditional on the column still being null so two passes racing cannot produce
 * two versions, and so a round started under v1 keeps v1 even if v2 ships
 * mid-round. The database's own check (attendance_sessions_practical_version_ck)
 * guarantees a completed round always has one; this decides WHICH one.
 */
async function stampRubricVersion(sessionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("attendance_sessions")
    .update({ practical_rubric_version: CURRENT_RUBRIC_VERSION })
    .eq("id", sessionId)
    .is("practical_rubric_version", null);

  if (error) {
    console.error("Could not stamp rubric version:", error.message);
    throw new Error(error.message);
  }
}

/**
 * Turn a Postgres error into something a teacher can act on.
 *
 * Both triggers on practical_observations raise P0001, so they are told apart by
 * message. Matching on message text is fragile in general; it is acceptable here
 * because both strings are defined in 21-practical-observations.sql in this same
 * repo, and the fallback is a safe generic message rather than a crash.
 */
function translateWriteError(error: { code?: string; message: string }): Error {
  if (error.code === "P0001") {
    if (error.message.includes("read-only")) {
      return new UserFacingError(
        "That term has closed, so its practical scores can no longer be changed.",
        409
      );
    }
    if (error.message.includes("not a present learner")) {
      return new UserFacingError(
        "One of those learners is not marked present for this lesson.",
        409
      );
    }
  }
  console.error("Practical observation write failed:", error.message);
  return new UserFacingError("Could not save that scoring. Please try again.", 500);
}

/**
 * Local rather than shared: the same three-part join is inlined at
 * lib/assessments.ts:878, :1005 and :1166. Consolidating all four into one
 * helper is worth doing, but it belongs in its own change rather than riding
 * along with a new feature.
 */
function fullName(
  person: { first_name: string; middle_name: string | null; last_name: string } | null
): string {
  if (!person) return "Unknown learner";
  return [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}
