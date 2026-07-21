import { getSupabaseAdmin } from "./supabase";
import type { TablesUpdate } from "./database.types";

// ─── Types ────────────────────────────────────────────────

export type AssessmentStatus = "draft" | "published" | "closed";

export interface Assessment {
  id: string; // uuid, internal
  systemId: string; // ASS0001 — the public identifier, used in URLs
  title: string;
  description: string;
  timeLimit: number; // minutes
  opensAt?: string;
  closesAt?: string;
  status: AssessmentStatus;
  targets: AssessmentTarget[];
}

/**
 * One narrowing rule for who may sit an assessment. An assessment with NO
 * targets is available to everyone — that is the "general" case, and it needs
 * no sentinel value.
 *
 * This replaces `target_type` + a pipe-delimited `target_value` such as
 * "Nairobi Academy|Form 3A", which could not be joined, indexed or validated,
 * and broke silently whenever a school renamed a class.
 */
export interface AssessmentTarget {
  id: string;
  schoolId: string | null;
  level: number | null;
  classId: string | null;
}

export type QuestionType =
  | "mcq"
  | "checkbox"
  | "fill"
  | "matching"
  | "dragdrop"
  | "short"
  | "long";

/** Types the server can mark on its own. The rest need a human. */
export const AUTO_SCORED_TYPES: ReadonlySet<QuestionType> = new Set<QuestionType>([
  "mcq",
  "checkbox",
  "fill",
]);

export interface Question {
  id: string;
  position: number;
  code: string; // 'Q1', shown to the student
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer?: string;
  maxScore: number;
  config?: unknown;
}

export interface CreateAssessmentInput {
  title: string;
  description?: string;
  timeLimit: number;
  opensAt?: string;
  closesAt?: string;
  status?: AssessmentStatus;
  targets?: Omit<AssessmentTarget, "id">[];
  createdBy?: string;
}

export interface UpdateAssessmentInput {
  title?: string;
  description?: string;
  timeLimit?: number;
  opensAt?: string | null;
  closesAt?: string | null;
  status?: AssessmentStatus;
  targets?: Omit<AssessmentTarget, "id">[];
}

interface AssessmentRow {
  id: string;
  system_id: string;
  title: string;
  description: string;
  time_limit_minutes: number;
  opens_at: string | null;
  closes_at: string | null;
  status: string;
  targets: { id: string; school_id: string | null; level: number | null; class_id: string | null }[] | null;
}

// Single string literal — concatenation would widen it to `string` and silently
// disable the client's column checking.
const ASSESSMENT_COLUMNS =
  "id, system_id, title, description, time_limit_minutes, opens_at, closes_at, status, targets:assessment_targets(id, school_id, level, class_id)";

const QUESTION_COLUMNS =
  "id, position, code, question_text, type, options, correct_answer, max_score, config";

// ─── Mappers ──────────────────────────────────────────────

function rowToAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    systemId: row.system_id,
    title: row.title,
    description: row.description,
    timeLimit: row.time_limit_minutes,
    opensAt: row.opens_at ?? undefined,
    closesAt: row.closes_at ?? undefined,
    status: row.status as AssessmentStatus,
    targets: (row.targets ?? []).map((t) => ({
      id: t.id,
      schoolId: t.school_id,
      level: t.level,
      classId: t.class_id,
    })),
  };
}

interface QuestionRow {
  id: string;
  position: number;
  code: string;
  question_text: string;
  type: string;
  options: unknown;
  correct_answer: string | null;
  max_score: number;
  config: unknown;
}

function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    position: row.position,
    code: row.code,
    questionText: row.question_text,
    questionType: row.type as QuestionType,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    correctAnswer: row.correct_answer ?? undefined,
    maxScore: Number(row.max_score),
    config: row.config ?? undefined,
  };
}

// ─── Assessments ──────────────────────────────────────────

/** Every assessment, for the admin console. Soft-deleted ones are excluded. */
export async function getAssessments(): Promise<Assessment[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching assessments:", error);
    return [];
  }
  return (data as unknown as AssessmentRow[]).map(rowToAssessment);
}

/**
 * The assessments a student may currently sit.
 *
 * Targeting, publication status and the open/close window are all evaluated by
 * `assessments_for_student` in the database, so there is exactly one
 * implementation of "may this student see this paper" rather than one per
 * caller.
 */
export async function getAssessmentsForStudent(studentId: string): Promise<Assessment[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("assessments_for_student", {
    p_student: studentId,
  });

  if (error) {
    console.error("Error fetching student assessments:", error);
    return [];
  }

  return (data ?? []).map((row) =>
    rowToAssessment({ ...(row as unknown as AssessmentRow), targets: [] })
  );
}

/** Look up by the public ASS#### identifier. */
export async function getAssessmentBySystemId(systemId: string): Promise<Assessment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("system_id", systemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("Error fetching assessment:", error);
    return null;
  }
  return data ? rowToAssessment(data as unknown as AssessmentRow) : null;
}

async function replaceTargets(
  assessmentId: string,
  targets: Omit<AssessmentTarget, "id">[]
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error: clearError } = await supabase
    .from("assessment_targets")
    .delete()
    .eq("assessment_id", assessmentId);
  if (clearError) throw new Error(clearError.message);

  // An all-null row would mean "everyone" and defeat every sibling target, so
  // it is dropped here as well as rejected by the table's check constraint.
  const rows = targets
    .filter((t) => t.schoolId !== null || t.level !== null || t.classId !== null)
    .map((t) => ({
      assessment_id: assessmentId,
      school_id: t.schoolId,
      level: t.level,
      class_id: t.classId,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("assessment_targets").insert(rows);
  if (error) throw new Error(error.message);
}

export async function createAssessment(input: CreateAssessmentInput): Promise<Assessment> {
  const supabase = getSupabaseAdmin();
  const { data: systemId, error: idError } = await supabase.rpc("generate_system_id", {
    p_entity_type: "assessment",
  });
  if (idError) throw new Error(idError.message);

  const { data, error } = await supabase
    .from("assessments")
    .insert({
      system_id: systemId as string,
      title: input.title,
      description: input.description ?? "",
      time_limit_minutes: input.timeLimit,
      opens_at: input.opensAt ?? null,
      closes_at: input.closesAt ?? null,
      status: input.status ?? "draft",
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (input.targets?.length) {
    await replaceTargets(data.id, input.targets);
  }

  const created = await getAssessmentBySystemId(systemId as string);
  if (!created) throw new Error("Assessment was created but could not be read back");
  return created;
}

export async function updateAssessment(
  systemId: string,
  updates: UpdateAssessmentInput
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const existing = await getAssessmentBySystemId(systemId);
  if (!existing) throw new Error("Assessment not found");

  const patch: TablesUpdate<"assessments"> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.timeLimit !== undefined) patch.time_limit_minutes = updates.timeLimit;
  if (updates.opensAt !== undefined) patch.opens_at = updates.opensAt;
  if (updates.closesAt !== undefined) patch.closes_at = updates.closesAt;
  if (updates.status !== undefined) patch.status = updates.status;

  const { error } = await supabase.from("assessments").update(patch).eq("id", existing.id);
  if (error) throw new Error(error.message);

  if (updates.targets) await replaceTargets(existing.id, updates.targets);
}

/**
 * Soft-delete. Submissions reference assessments, and removing a paper must
 * never take students' answers with it.
 */
export async function softDeleteAssessment(systemId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("assessments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("system_id", systemId);
  if (error) throw new Error(error.message);
}

// ─── Questions ────────────────────────────────────────────

export async function getQuestions(assessmentId: string): Promise<Question[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("questions")
    .select(QUESTION_COLUMNS)
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true });

  if (error) {
    console.error("Error fetching questions:", error);
    return [];
  }
  return (data as unknown as QuestionRow[]).map(rowToQuestion);
}

/**
 * Replace the whole paper.
 *
 * Refused once anyone has sat it: rewriting questions under existing answers
 * would silently invalidate every score already recorded against them.
 */
export async function saveQuestions(
  assessmentId: string,
  questions: Omit<Question, "id">[]
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { count, error: countError } = await supabase
    .from("assessment_submissions")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId);
  if (countError) throw new Error(countError.message);
  if (count && count > 0) {
    throw new Error(
      `Cannot change the questions — ${count} student(s) have already submitted this assessment.`
    );
  }

  const { error: deleteError } = await supabase
    .from("questions")
    .delete()
    .eq("assessment_id", assessmentId);
  if (deleteError) throw new Error(deleteError.message);

  if (!questions.length) return;

  const rows = questions.map((q, index) => ({
    assessment_id: assessmentId,
    position: q.position ?? index + 1,
    code: q.code || `Q${index + 1}`,
    question_text: q.questionText,
    type: q.questionType,
    options: q.options ?? [],
    correct_answer: q.correctAnswer ?? null,
    max_score: q.maxScore,
    config: (q.config ?? null) as never,
  }));

  const { error } = await supabase.from("questions").insert(rows);
  if (error) throw new Error(error.message);
}

// ─── Submissions & responses ──────────────────────────────

export interface SubmissionAnswer {
  questionId: string;
  answer: string;
  score?: number;
  isAutoScored: boolean;
}

export interface ResponseRecord {
  id: string;
  submissionId: string;
  studentName: string;
  school: string;
  className: string;
  questionId: string;
  questionCode: string;
  answer: string;
  score: number | null;
  maxScore: number;
  submittedAt: string;
}

/**
 * Record a student's sitting: one submission row plus one response per
 * question, written together.
 *
 * The (assessment_id, student_id) unique constraint is what makes "already
 * submitted" a database guarantee rather than a race between two in-flight
 * requests — so a duplicate is surfaced as its own error, not a generic one.
 */
export async function saveSubmission(input: {
  assessmentId: string;
  studentId: string;
  enrollmentId: string;
  timeSpentSeconds: number;
  answers: SubmissionAnswer[];
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: submission, error: submissionError } = await supabase
    .from("assessment_submissions")
    .insert({
      assessment_id: input.assessmentId,
      student_id: input.studentId,
      enrollment_id: input.enrollmentId,
      time_spent_seconds: input.timeSpentSeconds,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (submissionError) {
    if (submissionError.code === "23505") throw new Error("ALREADY_SUBMITTED");
    throw new Error(submissionError.message);
  }

  if (!input.answers.length) return;

  const { error: responseError } = await supabase.from("responses").insert(
    input.answers.map((a) => ({
      submission_id: submission.id,
      question_id: a.questionId,
      answer: a.answer,
      score: a.score ?? null,
      is_auto_scored: a.isAutoScored,
    }))
  );

  if (responseError) {
    // Leaving a submission with no answers behind would count as "already
    // submitted" and lock the student out of retrying.
    await supabase.from("assessment_submissions").delete().eq("id", submission.id);
    throw new Error(responseError.message);
  }
}

interface ResponseRow {
  id: string;
  submission_id: string;
  answer: string;
  score: number | null;
  question: { id: string; code: string; max_score: number } | null;
  submission: {
    assessment_id: string;
    submitted_at: string;
    student: { first_name: string; middle_name: string | null; last_name: string } | null;
    enrollment: {
      school: { name: string } | null;
      class: { alias: string | null; grade_level: { code: string } | null } | null;
      stream: { name: string } | null;
    } | null;
  } | null;
}

// The profiles embed MUST name its foreign key: assessment_submissions points
// at profiles twice (student_id and marked_by), so an unqualified
// `student:profiles(...)` is ambiguous and PostgREST refuses the query rather
// than guessing which one you meant.
// `!inner` is load-bearing, not decoration: this query filters on
// `submission.assessment_id`, and PostgREST only applies a filter against an
// embedded table when that embed is an inner join. Without it the filter is
// silently ignored and EVERY response in the database comes back — which reads
// as working right up until a second assessment exists.
const RESPONSE_COLUMNS =
  "id, submission_id, answer, score, question:questions(id, code, max_score), submission:assessment_submissions!inner(assessment_id, submitted_at, student:profiles!assessment_submissions_student_id_fkey(first_name, middle_name, last_name), enrollment:enrollments(school:schools(name), class:classes(alias, grade_level:grade_levels(code)), stream:streams(name)))";

/**
 * Every response to an assessment, for marking.
 *
 * The school and class come from the ENROLMENT the student sat under, not
 * their current placement — so a paper marked after they are promoted still
 * reads as the class they were in on the day.
 */
export async function getResponses(assessmentId: string): Promise<ResponseRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("responses")
    .select(RESPONSE_COLUMNS)
    .eq("submission.assessment_id", assessmentId);

  if (error) {
    console.error("Error fetching responses:", error);
    return [];
  }

  return (data as unknown as ResponseRow[]).map((row) => {
    const student = row.submission?.student;
    const enrollment = row.submission?.enrollment;
    return {
      id: row.id,
      submissionId: row.submission_id,
      studentName: student
        ? [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ").trim()
        : "",
      school: enrollment?.school?.name ?? "",
      className: [
        enrollment?.class?.alias ?? enrollment?.class?.grade_level?.code ?? "",
        enrollment?.stream?.name ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      questionId: row.question?.id ?? "",
      questionCode: row.question?.code ?? "",
      answer: row.answer,
      score: row.score === null ? null : Number(row.score),
      maxScore: Number(row.question?.max_score ?? 0),
      submittedAt: row.submission?.submitted_at ?? "",
    };
  });
}

export interface AssessmentResult {
  submissionId: string;
  studentName: string;
  studentSystemId: string | null;
  school: string;
  className: string;
  submittedAt: string;
  timeSpentSeconds: number;
  totalScore: number | null;
  maxScore: number | null;
  /** null until the paper is fully marked. */
  percentage: number | null;
  status: string;
}

interface ResultRow {
  id: string;
  submitted_at: string;
  time_spent_seconds: number;
  total_score: number | null;
  max_score: number | null;
  status: string;
  student: { system_id: string | null; first_name: string; middle_name: string | null; last_name: string } | null;
  enrollment: {
    school: { name: string } | null;
    class: { alias: string | null; grade_level: { code: string } | null } | null;
    stream: { name: string } | null;
  } | null;
}

// Same disambiguation as RESPONSE_COLUMNS: student_id, not marked_by.
const RESULT_COLUMNS =
  "id, submitted_at, time_spent_seconds, total_score, max_score, status, student:profiles!assessment_submissions_student_id_fkey(system_id, first_name, middle_name, last_name), enrollment:enrollments(school:schools(name), class:classes(alias, grade_level:grade_levels(code)), stream:streams(name))";

/**
 * One row per student who sat the assessment, with their marked total.
 *
 * Totals come from the submission, which a database trigger keeps in step with
 * the individual responses — so this can never report a score that disagrees
 * with the answers behind it.
 */
export async function getAssessmentResults(assessmentId: string): Promise<AssessmentResult[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select(RESULT_COLUMNS)
    .eq("assessment_id", assessmentId)
    .order("submitted_at", { ascending: true });

  if (error) {
    console.error("Error fetching results:", error);
    return [];
  }

  return (data as unknown as ResultRow[]).map((row) => {
    const student = row.student;
    const enrollment = row.enrollment;
    const total = row.total_score === null ? null : Number(row.total_score);
    const max = row.max_score === null ? null : Number(row.max_score);
    return {
      submissionId: row.id,
      studentName: student
        ? [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ").trim()
        : "",
      studentSystemId: student?.system_id ?? null,
      school: enrollment?.school?.name ?? "",
      className: [
        enrollment?.class?.alias ?? enrollment?.class?.grade_level?.code ?? "",
        enrollment?.stream?.name ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      submittedAt: row.submitted_at,
      timeSpentSeconds: row.time_spent_seconds,
      totalScore: total,
      maxScore: max,
      // Only meaningful once marking is finished; a partial total would read as
      // a low score rather than an incomplete one.
      percentage:
        row.status === "marked" && total !== null && max !== null && max > 0
          ? Math.round((total / max) * 1000) / 10
          : null,
      status: row.status,
    };
  });
}

/**
 * Manual marking of one answer. The submission's totals are recalculated by a
 * database trigger, so a score can never disagree with the answers it is
 * derived from.
 */
export async function updateResponseScore(
  responseId: string,
  score: number,
  markedBy: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("responses")
    .update({ score, marked_by: markedBy, marked_at: new Date().toISOString() })
    .eq("id", responseId);

  // The trigger refuses a score above the question's maximum.
  if (error) {
    if (error.code === "P0001") throw new Error(error.message);
    throw new Error(error.message);
  }
}
