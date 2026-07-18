import { getSupabaseAdmin } from "./supabase";

// ─── Types ────────────────────────────────────────────────

export interface Assessment {
  id: string;
  title: string;
  description: string;
  timeLimit: number; // minutes
  startTime?: string; // ISO datetime
  targetType: "general" | "class" | "school+class";
  targetValue: string; // e.g. 'Form 3A' or 'Nairobi Academy|Form 3A'
  questionsSheet: string;
}

export interface StudentResponse {
  studentName: string;
  school: string;
  class: string;
  assessmentId: string;
  questionId: string;
  answer: string;
  timestamp: string;
  timeSpent: number; // seconds
  score?: number;
}

export type QuestionType =
  | "mcq"
  | "checkbox"
  | "fill"
  | "matching"
  | "dragdrop"
  | "short"
  | "long";

export interface Question {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer?: string;
  maxScore: number;
  config?: unknown;
}

export interface CreateAssessmentInput {
  id: string;
  title: string;
  description?: string;
  timeLimit: number;
  startTime?: string;
  targetType: Assessment["targetType"];
  targetValue?: string;
  questionsSheet: string;
}

export interface UpdateAssessmentInput {
  title?: string;
  description?: string;
  timeLimit?: number;
  startTime?: string;
  targetType?: Assessment["targetType"];
  targetValue?: string;
  questionsSheet?: string;
}

interface AssessmentRow {
  id: string;
  title: string | null;
  description: string | null;
  time_limit: number | null;
  start_time: string | null;
  target_type: string | null;
  target_value: string | null;
  questions_sheet: string | null;
}

interface QuestionRow {
  question_id: string | null;
  question_text: string | null;
  type: string | null;
  options: string[] | null;
  correct_answer: string | null;
  max_score: number | null;
  config: unknown;
}

// ─── Mappers ──────────────────────────────────────────────

function rowToAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    title: row.title ?? "",
    description: row.description ?? "",
    timeLimit: row.time_limit ?? 0,
    startTime: row.start_time || undefined,
    targetType: (row.target_type as Assessment["targetType"]) ?? "general",
    targetValue: row.target_value ?? "",
    questionsSheet: row.questions_sheet ?? "",
  };
}

function rowToQuestion(row: QuestionRow): Question {
  return {
    questionId: row.question_id ?? "",
    questionText: row.question_text ?? "",
    questionType: (row.type as QuestionType) ?? "short",
    options: row.options ?? [],
    correctAnswer: row.correct_answer ?? undefined,
    maxScore: row.max_score ?? 1,
    config: row.config ?? undefined,
  };
}

// ─── Assessments ──────────────────────────────────────────

/**
 * Get all assessments, optionally filtered by school and class.
 */
export async function getAssessments(
  school?: string,
  className?: string
): Promise<Assessment[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessments")
    .select(
      "id, title, description, time_limit, start_time, target_type, target_value, questions_sheet"
    )
    .eq("deleted", false)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching assessments:", error);
    return [];
  }

  const assessments = (data ?? []).map(rowToAssessment);

  return assessments.filter((assessment) => {
    if (school && className) {
      if (assessment.targetType === "general") return true;
      if (assessment.targetType === "class") {
        return assessment.targetValue === className;
      }
      if (assessment.targetType === "school+class") {
        const [s, c] = assessment.targetValue.split("|");
        return s === school && c === className;
      }
    } else if (school && !className) {
      if (assessment.targetType === "class") return false;
      if (assessment.targetType === "school+class") {
        const [s] = assessment.targetValue.split("|");
        return s === school;
      }
    }
    return true;
  });
}

/**
 * Get a single assessment by its ID.
 */
export async function getAssessmentById(
  id: string
): Promise<Assessment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessments")
    .select(
      "id, title, description, time_limit, start_time, target_type, target_value, questions_sheet"
    )
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();

  if (error) {
    console.error("Error fetching assessment by ID:", error);
    return null;
  }
  return data ? rowToAssessment(data) : null;
}

export async function createAssessment(input: CreateAssessmentInput) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("assessments").insert({
    id: input.id,
    title: input.title,
    description: input.description ?? "",
    time_limit: input.timeLimit,
    start_time: input.startTime ?? "",
    target_type: input.targetType,
    target_value: input.targetValue ?? "",
    questions_sheet: input.questionsSheet,
    deleted: false,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateAssessment(
  id: string,
  updates: UpdateAssessmentInput
) {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.timeLimit !== undefined) patch.time_limit = updates.timeLimit;
  if (updates.startTime !== undefined) patch.start_time = updates.startTime;
  if (updates.targetType !== undefined) patch.target_type = updates.targetType;
  if (updates.targetValue !== undefined)
    patch.target_value = updates.targetValue;
  if (updates.questionsSheet !== undefined)
    patch.questions_sheet = updates.questionsSheet;

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("assessments")
    .update(patch)
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Soft-delete an assessment (sets deleted = true).
 */
export async function softDeleteAssessment(id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("assessments")
    .update({ deleted: true })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

// ─── Questions ────────────────────────────────────────────

/**
 * Get questions for a specific assessment.
 */
export async function getQuestions(assessmentId: string): Promise<Question[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("questions")
    .select(
      "question_id, question_text, type, options, correct_answer, max_score, config"
    )
    .eq("assessment_id", assessmentId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching questions:", error);
    return [];
  }
  return (data ?? []).map(rowToQuestion);
}

export async function deleteQuestionsForAssessment(assessmentId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("assessment_id", assessmentId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Replace all questions for an assessment.
 */
export async function saveQuestions(
  assessmentId: string,
  questions: Question[]
) {
  await deleteQuestionsForAssessment(assessmentId);
  if (!questions.length) return;

  const supabase = getSupabaseAdmin();
  const rows = questions.map((q) => ({
    assessment_id: assessmentId,
    question_id: q.questionId,
    question_text: q.questionText,
    type: q.questionType,
    options: q.options ?? [],
    correct_answer: q.correctAnswer ?? null,
    max_score: q.maxScore,
    config: q.config ?? null,
  }));

  const { error } = await supabase.from("questions").insert(rows);
  if (error) {
    throw new Error(error.message);
  }
}

// ─── Responses ────────────────────────────────────────────

/**
 * Save student responses.
 */
export async function saveResponses(responses: StudentResponse[]) {
  if (!responses.length) return;

  const supabase = getSupabaseAdmin();
  const rows = responses.map((r) => ({
    student_name: r.studentName,
    school: r.school,
    class: r.class,
    assessment_id: r.assessmentId,
    question_id: r.questionId,
    answer: r.answer,
    submitted_at: r.timestamp,
    time_spent: r.timeSpent,
    score: r.score ?? null,
  }));

  const { error } = await supabase.from("responses").insert(rows);
  if (error) {
    console.error("Error saving responses:", error);
    throw new Error("Failed to save assessment responses");
  }
}
