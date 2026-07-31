import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";

export interface LibraryFeedback {
  id: string;
  contentId: string;
  submittedBy: string;
  submittedByName: string;
  rating: number | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  content_id: string;
  submitted_by: string;
  rating: number | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
  submitter: { first_name: string; last_name: string } | null;
}

const SELECT =
  "id, content_id, submitted_by, rating, comment, created_at, updated_at, " +
  "submitter:profiles!library_feedback_submitted_by_fkey(first_name, last_name)";

function rowToFeedback(row: Row): LibraryFeedback {
  return {
    id: row.id,
    contentId: row.content_id,
    submittedBy: row.submitted_by,
    submittedByName: [row.submitter?.first_name, row.submitter?.last_name].filter(Boolean).join(" "),
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * One entry per (content, submitter) — resubmitting updates the existing
 * entry rather than piling up duplicates, enforced by the
 * library_feedback_one_per_submitter unique constraint (17-library.sql).
 */
export async function submitLibraryFeedback(input: {
  contentId: string;
  submittedBy: string;
  rating?: number;
  comment?: string;
}): Promise<void> {
  if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    throw new UserFacingError("Rating must be a whole number from 1 to 5.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("library_feedback").upsert(
    {
      content_id: input.contentId,
      submitted_by: input.submittedBy,
      rating: input.rating ?? null,
      comment: input.comment?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "content_id,submitted_by" }
  );
  if (error) throw new Error(error.message);
}

/** Restricted to the content's creator and admin/super_admin — never other browsing users. */
export async function getLibraryFeedback(contentId: string): Promise<LibraryFeedback[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("library_feedback")
    .select(SELECT)
    .eq("content_id", contentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as Row[]).map(rowToFeedback);
}
