import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";
import { getQuestions } from "@/lib/assessments";

export interface SubmissionScan {
  id: string;
  pageNumber: number;
  url: string;
  publicId: string;
  uploadedAt: string;
}

export interface OfflineSubmission {
  submissionId: string;
  mode: "online" | "scanned";
  submittedAt: string;
  scans: SubmissionScan[];
}

/**
 * Starts (or returns) a learner's paper-based sitting.
 *
 * A scanned sitting creates an empty response row for every question. Marking,
 * the fully-marked gate and the results sheet all work off responses, so
 * without those rows a scanned paper would look permanently unmarked and could
 * never have its results released. The marker fills the scores in while reading
 * the scan.
 */
export async function startScannedSubmission(input: {
  assessmentId: string;
  studentId: string;
  enrollmentId: string;
}): Promise<{ submissionId: string; created: boolean }> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: readError } = await supabase
    .from("assessment_submissions")
    .select("id, mode")
    .eq("assessment_id", input.assessmentId)
    .eq("student_id", input.studentId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  if (existing) {
    // The one-sitting rule covers both modes: somebody who answered online
    // cannot then upload a paper as a second attempt.
    if (existing.mode !== "scanned") {
      throw new UserFacingError(
        "You have already submitted this assessment online, so a scanned paper cannot be added."
      );
    }
    return { submissionId: existing.id, created: false };
  }

  const { data: submission, error } = await supabase
    .from("assessment_submissions")
    .insert({
      assessment_id: input.assessmentId,
      student_id: input.studentId,
      enrollment_id: input.enrollmentId,
      mode: "scanned",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") throw new UserFacingError("ALREADY_SUBMITTED");
    throw new Error(error.message);
  }

  const questions = await getQuestions(input.assessmentId);
  if (questions.length > 0) {
    const { error: responseError } = await supabase.from("responses").insert(
      questions.map((q) => ({
        submission_id: submission.id,
        question_id: q.id,
        // Blank rather than a typed answer: the answer lives on the paper.
        answer: "",
        is_auto_scored: false,
      }))
    );
    if (responseError) {
      // Leaving a submission without response rows would lock the learner out
      // and be unmarkable, so roll the whole sitting back.
      await supabase.from("assessment_submissions").delete().eq("id", submission.id);
      throw new Error(responseError.message);
    }
  }

  return { submissionId: submission.id, created: true };
}

export async function attachScan(input: {
  submissionId: string;
  pageNumber: number;
  url: string;
  publicId: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  // Upsert on (submission, page): re-photographing a blurred page 2 replaces
  // it rather than adding a second page 2 nobody can tell apart.
  const { error } = await supabase.from("submission_scans").upsert(
    {
      submission_id: input.submissionId,
      page_number: input.pageNumber,
      url: input.url,
      public_id: input.publicId,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "submission_id,page_number" }
  );
  if (error) throw new Error(error.message);
}

export async function removeScan(submissionId: string, pageNumber: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("submission_scans")
    .delete()
    .eq("submission_id", submissionId)
    .eq("page_number", pageNumber);
  if (error) throw new Error(error.message);
}

export async function getSubmissionScans(submissionId: string): Promise<SubmissionScan[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("submission_scans")
    .select("id, page_number, url, public_id, uploaded_at")
    .eq("submission_id", submissionId)
    .order("page_number");
  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => ({
    id: s.id,
    pageNumber: s.page_number,
    url: s.url,
    publicId: s.public_id,
    uploadedAt: s.uploaded_at,
  }));
}

/** A learner's sitting for one assessment, if they have one. */
export async function getSubmissionFor(
  assessmentId: string,
  studentId: string
): Promise<OfflineSubmission | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select("id, mode, submitted_at")
    .eq("assessment_id", assessmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    submissionId: data.id,
    mode: data.mode as "online" | "scanned",
    submittedAt: data.submitted_at,
    scans: data.mode === "scanned" ? await getSubmissionScans(data.id) : [],
  };
}
