import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";

/**
 * A sitting is the record that a learner opened a paper, and when.
 *
 * It exists so the countdown is anchored to a server timestamp rather than the
 * learner's browser. Progress used to live entirely in sessionStorage, which
 * is erased when the browser session ends — so a power cut destroyed the work
 * AND handed out a fresh clock, because the start time was in there too.
 *
 * Deliberately NOT an `in_progress` row on assessment_submissions: see the
 * reasoning at the top of 08-sittings.sql. That table means "a completed
 * sitting", and keeping it that way is what makes its unique constraint a real
 * one-attempt guarantee.
 */
export interface Sitting {
  startedAt: string;
  /** Seconds left, computed from the server clock. Null when untimed. */
  remainingSeconds: number | null;
  /** True when the paper has already been submitted — the client must not reopen it. */
  submitted: boolean;
}

/**
 * Start the learner's sitting, or return the one already open.
 *
 * Idempotent by design: a reload, a reboot, or moving to another machine all
 * resume the same clock. That idempotency is enforced by
 * unique(assessment_id, student_id), not by checking first and inserting after,
 * so two tabs racing cannot produce two start times.
 */
export async function startOrResumeSitting(input: {
  assessmentId: string;
  studentId: string;
  enrollmentId: string;
  timeLimitMinutes: number | null;
}): Promise<Sitting> {
  const supabase = getSupabaseAdmin();

  const { data: existingSubmission } = await supabase
    .from("assessment_submissions")
    .select("id")
    .eq("assessment_id", input.assessmentId)
    .eq("student_id", input.studentId)
    .maybeSingle();

  if (existingSubmission) {
    return { startedAt: new Date().toISOString(), remainingSeconds: 0, submitted: true };
  }

  const { data: inserted, error } = await supabase
    .from("assessment_sittings")
    .insert({
      assessment_id: input.assessmentId,
      student_id: input.studentId,
      enrollment_id: input.enrollmentId,
    })
    .select("started_at")
    .maybeSingle();

  let startedAt = inserted?.started_at ?? null;

  if (error) {
    // 23505 = they already had a sitting. That is the resume path, not a fault.
    if (error.code !== "23505") {
      // Logged, not returned: the raw message carries schema detail (table and
      // column names) that has no business reaching a learner's browser.
      console.error("Could not open sitting:", error.message);
      throw new Error(error.message);
    }

    const { data: existing } = await supabase
      .from("assessment_sittings")
      .select("started_at")
      .eq("assessment_id", input.assessmentId)
      .eq("student_id", input.studentId)
      .single();
    startedAt = existing?.started_at ?? null;

    await supabase
      .from("assessment_sittings")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("assessment_id", input.assessmentId)
      .eq("student_id", input.studentId);
  }

  if (!startedAt) throw new UserFacingError("Could not start this sitting.", 500);

  return {
    startedAt,
    remainingSeconds: remainingFor(startedAt, input.timeLimitMinutes),
    submitted: false,
  };
}

/**
 * Seconds left on the server's clock. Never negative — a paper whose time has
 * run out reports 0, which the client treats as "submit now".
 */
export function remainingFor(startedAt: string, timeLimitMinutes: number | null): number | null {
  if (!timeLimitMinutes || timeLimitMinutes <= 0) return null;
  const elapsed = (Date.now() - Date.parse(startedAt)) / 1000;
  return Math.max(0, Math.round(timeLimitMinutes * 60 - elapsed));
}
