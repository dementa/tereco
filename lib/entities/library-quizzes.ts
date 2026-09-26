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

// ─── Full quiz (authoring) ──────────────────────────────────────────────

export interface LibraryQuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
}

export interface LibraryQuiz {
  id: string;
  contentId: string;
  title: string;
  status: "draft" | "published";
  createdBy: string;
  questions: LibraryQuizQuestion[];
}

interface QuestionRow {
  id: string;
  prompt: string;
  options: unknown;
  correct_index: number;
  explanation: string | null;
  image_url: string | null;
  image_public_id: string | null;
}

function rowToQuestion(r: QuestionRow): LibraryQuizQuestion {
  return {
    id: r.id,
    prompt: r.prompt,
    options: (r.options as string[]) ?? [],
    correctIndex: r.correct_index,
    explanation: r.explanation,
    imageUrl: r.image_url,
    imagePublicId: r.image_public_id,
  };
}

/** One quiz with its questions in order — INCLUDING the answers, so authoring-side only. */
export async function getQuiz(quizId: string): Promise<LibraryQuiz | null> {
  const supabase = getSupabaseAdmin();
  const { data: quiz, error } = await supabase
    .from("library_quizzes")
    .select("id, content_id, title, status, created_by")
    .eq("id", quizId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!quiz) return null;

  const { data: qs, error: qErr } = await supabase
    .from("library_quiz_questions")
    .select("id, prompt, options, correct_index, explanation, image_url, image_public_id")
    .eq("quiz_id", quizId)
    .order("position", { ascending: true });
  if (qErr) throw new Error(qErr.message);

  return {
    id: quiz.id,
    contentId: quiz.content_id,
    title: quiz.title,
    status: quiz.status as "draft" | "published",
    createdBy: quiz.created_by,
    questions: ((qs ?? []) as unknown as QuestionRow[]).map(rowToQuestion),
  };
}

export interface QuizQuestionInput {
  /** Client-assigned so an image uploaded before the first save keeps pointing at the right question. */
  id?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
  imageUrl?: string | null;
  imagePublicId?: string | null;
}

function questionRows(quizId: string, questions: QuizQuestionInput[]) {
  return questions.map((q, position) => ({
    ...(q.id ? { id: q.id } : {}),
    quiz_id: quizId,
    position,
    prompt: q.prompt,
    options: q.options,
    correct_index: q.correctIndex,
    explanation: q.explanation || null,
    image_url: q.imageUrl ?? null,
    image_public_id: q.imagePublicId ?? null,
  }));
}

/** Always created as a draft — nothing reaches a learner until the teacher publishes it. */
export async function createQuiz(input: {
  contentId: string;
  title: string;
  createdBy: string;
  questions: QuizQuestionInput[];
}): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("library_quizzes")
    .insert({ content_id: input.contentId, title: input.title, created_by: input.createdBy })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (input.questions.length > 0) {
    const { error: qErr } = await supabase
      .from("library_quiz_questions")
      .insert(questionRows(data.id, input.questions));
    if (qErr) {
      // Don't leave an empty husk behind that the teacher never asked for.
      await supabase.from("library_quizzes").delete().eq("id", data.id);
      throw new Error(qErr.message);
    }
  }
  return data.id;
}

/**
 * Saves the whole quiz as the editor holds it. Questions are matched by id, so
 * an unchanged question keeps its row (and its image); ones the teacher
 * removed are deleted. Positions are rewritten last — the (quiz, position)
 * unique constraint is deferrable for exactly this reorder.
 *
 * Editing a PUBLISHED quiz keeps it published: it is untimed practice with no
 * stored attempts, so there is no result history for an edit to invalidate.
 */
export async function saveQuiz(quizId: string, title: string, questions: QuizQuestionInput[]): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error: tErr } = await supabase.from("library_quizzes").update({ title }).eq("id", quizId);
  if (tErr) throw new Error(tErr.message);

  const { data: existing, error: eErr } = await supabase
    .from("library_quiz_questions")
    .select("id")
    .eq("quiz_id", quizId);
  if (eErr) throw new Error(eErr.message);

  const keep = new Set(questions.map((q) => q.id).filter((id): id is string => !!id));
  const drop = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));
  if (drop.length > 0) {
    const { error } = await supabase.from("library_quiz_questions").delete().in("id", drop);
    if (error) throw new Error(error.message);
  }

  if (questions.length > 0) {
    const withIds = questionRows(quizId, questions.map((q) => ({ ...q, id: q.id ?? crypto.randomUUID() })));
    const { error } = await supabase.from("library_quiz_questions").upsert(withIds, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
}

export async function setQuizPublished(quizId: string, published: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("library_quizzes")
    .update(published ? { status: "published", published_at: new Date().toISOString() } : { status: "draft", published_at: null })
    .eq("id", quizId);
  if (error) throw new Error(error.message);
}

export async function deleteQuiz(quizId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("library_quizzes").delete().eq("id", quizId);
  if (error) throw new Error(error.message);
}

// ─── Taking a quiz ──────────────────────────────────────────────────────

export interface PlayableQuestion {
  id: string;
  prompt: string;
  options: string[];
  imageUrl: string | null;
}

/** The learner's view: no correct answers and no explanations. Those come back one question at a time from checkAnswer. */
export function toPlayable(quiz: LibraryQuiz): { id: string; title: string; questions: PlayableQuestion[] } {
  return {
    id: quiz.id,
    title: quiz.title,
    questions: quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, imageUrl: q.imageUrl })),
  };
}

export function checkAnswer(
  quiz: LibraryQuiz,
  questionId: string,
  choice: number
): { correct: boolean; correctIndex: number; explanation: string | null } | null {
  const q = quiz.questions.find((x) => x.id === questionId);
  if (!q) return null;
  return { correct: q.correctIndex === choice, correctIndex: q.correctIndex, explanation: q.explanation };
}

/**
 * Every PUBLISHED quiz on the given documents, with questions and answers.
 *
 * For the offline library only: a lab machine has no server to mark an answer
 * against, so the key has to travel with the quiz. Drafts never leave.
 */
export async function getPublishedQuizzesForContents(contentIds: string[]): Promise<LibraryQuiz[]> {
  if (contentIds.length === 0) return [];
  const supabase = getSupabaseAdmin();

  const { data: quizzes, error } = await supabase
    .from("library_quizzes")
    .select("id, content_id, title, status, created_by")
    .in("content_id", contentIds)
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!quizzes || quizzes.length === 0) return [];

  const { data: qs, error: qErr } = await supabase
    .from("library_quiz_questions")
    .select("id, quiz_id, prompt, options, correct_index, explanation, image_url, image_public_id")
    .in("quiz_id", quizzes.map((q) => q.id))
    .order("position", { ascending: true });
  if (qErr) throw new Error(qErr.message);

  const byQuiz = new Map<string, LibraryQuizQuestion[]>();
  for (const row of (qs ?? []) as unknown as (QuestionRow & { quiz_id: string })[]) {
    const list = byQuiz.get(row.quiz_id) ?? [];
    list.push(rowToQuestion(row));
    byQuiz.set(row.quiz_id, list);
  }

  return quizzes
    .map((quiz) => ({
      id: quiz.id,
      contentId: quiz.content_id,
      title: quiz.title,
      status: quiz.status as "draft" | "published",
      createdBy: quiz.created_by,
      questions: byQuiz.get(quiz.id) ?? [],
    }))
    // A published quiz always has questions (publish refuses otherwise), but
    // one emptied since would open as a blank screen offline with no way to fix it.
    .filter((quiz) => quiz.questions.length > 0);
}
