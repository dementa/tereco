import { getSupabaseAdmin } from "@/lib/supabase";

export interface LibraryQuizSummary {
  id: string;
  contentId: string;
  title: string;
  status: "draft" | "published";
  questionCount: number;
  createdBy: string;
}

interface Row {
  id: string;
  content_id: string;
  title: string;
  status: "draft" | "published";
  created_by: string;
  questions: { count: number }[] | null;
}

/**
 * The quizzes attached to one document. Learners get published ones only;
 * `includeDrafts` is for the document's own author and admins, who need to
 * see what they are still building.
 */
export async function listQuizzesForContent(
  contentId: string,
  opts: { includeDrafts?: boolean } = {}
): Promise<LibraryQuizSummary[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("library_quizzes")
    .select("id, content_id, title, status, created_by, questions:library_quiz_questions(count)")
    .eq("content_id", contentId)
    .order("created_at", { ascending: true });
  if (!opts.includeDrafts) query = query.eq("status", "published");

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    contentId: r.content_id,
    title: r.title,
    status: r.status,
    createdBy: r.created_by,
    questionCount: r.questions?.[0]?.count ?? 0,
  }));
}
