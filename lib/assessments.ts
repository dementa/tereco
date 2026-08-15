import { getSupabaseAdmin } from "./supabase";
import type { TablesUpdate } from "./database.types";
import { UserFacingError } from "./apiResponse";
import { notify } from "./entities/notifications";
import { computeCodes, isStemParent, type QuestionConfig } from "./questionGrouping";
import { STUDENT_PLACEHOLDER_DOMAIN } from "./entities/accounts";

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
  /** Who authored it — the owner, per lib/auth/access.ts. */
  createdBy: string | null;
  /** Printed at the top of the question paper. */
  instructions: string;
  resultsReleasedAt?: string;
  /** When this closed paper was published for untimed practice. Undefined = not an E-Paper. */
  ePaperAt?: string;
  /** Set by a super_admin to remove this assessment from every other role's lists. */
  hiddenAt?: string;
  /** Whether marks from this assessment count toward the blended performance figure. Defaults true — a super_admin opts an assessment OUT, never in. */
  includeInEvaluation: boolean;
  targets: AssessmentTarget[];
  /** Staff granted edit+mark access by the owner. See lib/auth/access.ts. */
  collaboratorIds: string[];
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
  studentId: string | null;
}

export type QuestionType =
  | "mcq"
  | "checkbox"
  | "true_false"
  | "fill"
  | "matching"
  | "dragdrop"
  | "short"
  | "long";

/** Types the server can mark on its own. The rest need a human. */
export const AUTO_SCORED_TYPES: ReadonlySet<QuestionType> = new Set<QuestionType>([
  "mcq",
  "checkbox",
  "true_false",
  "fill",
]);

/** Types whose correct answer must be one of the entered options. */
export const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set<QuestionType>([
  "mcq",
  "checkbox",
  "true_false",
]);

/** The fixed options for a true/false question — never author-supplied. */
export const TRUE_FALSE_OPTIONS = ["True", "False"];

export interface Question {
  id: string;
  position: number;
  code: string; // 'Q1', shown to the student
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer?: string;
  /** Expected answer / mark split for hand-marked questions. Optional. */
  modelAnswer?: string;
  imageUrl?: string;
  imagePublicId?: string;
  maxScore: number;
  config?: QuestionConfig;
}

export interface CreateAssessmentInput {
  title: string;
  description?: string;
  timeLimit: number;
  opensAt?: string;
  closesAt?: string;
  status?: AssessmentStatus;
  instructions?: string;
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
  instructions?: string;
  /** Publish (or withdraw) this closed paper as an untimed practice E-Paper. */
  isEPaper?: boolean;
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
  created_by: string | null;
  instructions: string;
  results_released_at: string | null;
  e_paper_at: string | null;
  hidden_at: string | null;
  include_in_evaluation: boolean;
  targets:
    | {
        id: string;
        school_id: string | null;
        level: number | null;
        class_id: string | null;
        student_id: string | null;
      }[]
    | null;
  collaborators: { staff_id: string }[] | null;
}

// Single string literal — concatenation would widen it to `string` and silently
// disable the client's column checking.
const ASSESSMENT_COLUMNS =
  "id, system_id, title, description, time_limit_minutes, opens_at, closes_at, status, created_by, instructions, results_released_at, e_paper_at, hidden_at, include_in_evaluation, targets:assessment_targets(id, school_id, level, class_id, student_id), collaborators:assessment_collaborators(staff_id)";

const QUESTION_COLUMNS =
  "id, position, code, question_text, type, options, correct_answer, model_answer, image_url, image_public_id, max_score, config";

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
    createdBy: row.created_by,
    instructions: row.instructions ?? "",
    resultsReleasedAt: row.results_released_at ?? undefined,
    ePaperAt: row.e_paper_at ?? undefined,
    hiddenAt: row.hidden_at ?? undefined,
    includeInEvaluation: row.include_in_evaluation,
    targets: (row.targets ?? []).map((t) => ({
      id: t.id,
      schoolId: t.school_id,
      level: t.level,
      classId: t.class_id,
      studentId: t.student_id,
    })),
    collaboratorIds: (row.collaborators ?? []).map((c) => c.staff_id),
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
  model_answer: string | null;
  image_url: string | null;
  image_public_id: string | null;
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
    modelAnswer: row.model_answer ?? undefined,
    imageUrl: row.image_url ?? undefined,
    imagePublicId: row.image_public_id ?? undefined,
    maxScore: Number(row.max_score),
    config: (row.config as QuestionConfig | null) ?? undefined,
  };
}

// ─── Assessments ──────────────────────────────────────────

/**
 * Assessments for the console. Soft-deleted ones are excluded.
 *
 * `createdBy` narrows the list to one author — teachers see only the papers
 * they wrote, while admins see everything.
 *
 * `includeHidden` defaults to false — a super_admin-hidden assessment (see
 * hideAssessment) stays out of every list, including a super_admin's own,
 * unless the caller explicitly opts in. That keeps hiding an actual decluttering
 * tool rather than something a super_admin has to look past every time.
 */
export async function getAssessments(
  createdBy?: string,
  opts?: { includeHidden?: boolean }
): Promise<Assessment[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("assessments").select(ASSESSMENT_COLUMNS).is("deleted_at", null);
  if (!opts?.includeHidden) query = query.is("hidden_at", null);
  if (createdBy) query = query.eq("created_by", createdBy);
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching assessments:", error);
    return [];
  }
  return (data as unknown as AssessmentRow[]).map(rowToAssessment);
}

/**
 * The assessments a teacher may edit: their own, plus any they've been
 * added to as a collaborator. Mirrors canManageAssessment in
 * lib/auth/access.ts; kept as a list-level filter here only for the "my
 * assessments" screen, not as a substitute for the per-request check every
 * assessment route still does.
 */
export async function getEditableAssessments(staffId: string): Promise<Assessment[]> {
  const all = await getAssessments();
  return all.filter((a) => a.createdBy === staffId || a.collaboratorIds.includes(staffId));
}

/**
 * The assessments a teacher may mark: everything getEditableAssessments
 * returns, plus any admin-authored paper that targets their school or
 * targets no one in particular (open to every school) — their students may
 * have sat either. Mirrors canMarkAssessment in lib/auth/access.ts; kept as
 * a list-level filter here only for the marking dropdown, not as a
 * substitute for the per-request check every marking route still does.
 */
export async function getMarkableAssessments(
  staffId: string,
  schoolId: string | null
): Promise<Assessment[]> {
  const all = await getAssessments();
  return all.filter(
    (a) =>
      a.createdBy === staffId ||
      a.collaboratorIds.includes(staffId) ||
      (schoolId != null &&
        (a.targets.length === 0 || a.targets.some((t) => t.schoolId === schoolId)))
  );
}

/**
 * Whether a school_admin at `schoolId` may see this assessment at all — an
 * empty target list is open to every school, otherwise at least one target
 * row must name this school. Shared by the school-admin list and single-
 * assessment routes so they can't drift into disagreeing about who counts.
 */
export function isAssessmentVisibleToSchool(assessment: Assessment, schoolId: string): boolean {
  return assessment.targets.length === 0 || assessment.targets.some((t) => t.schoolId === schoolId);
}

/**
 * Every assessment targeting one school (or open to every school), for the
 * school-admin oversight page — a read-only superset of what any one of that
 * school's teachers could mark, since it isn't limited to a single staffId.
 */
export async function getAssessmentsForSchool(schoolId: string): Promise<Assessment[]> {
  const all = await getAssessments();
  return all.filter((a) => isAssessmentVisibleToSchool(a, schoolId));
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
    rowToAssessment({ ...(row as unknown as AssessmentRow), targets: [], collaborators: [] })
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
    .filter((t) => t.schoolId !== null || t.level !== null || t.classId !== null || t.studentId !== null)
    .map((t) => ({
      assessment_id: assessmentId,
      school_id: t.schoolId,
      level: t.level,
      class_id: t.classId,
      student_id: t.studentId,
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
      instructions: input.instructions ?? "",
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
  if (updates.instructions !== undefined) patch.instructions = updates.instructions;
  // Publishing a paper for practice is a separate act from closing it, even
  // when the two happen in one click. Passing false un-publishes it: the paper
  // drops straight out of e_papers_for_student, which is the whole withdrawal
  // mechanism — there is no second copy to delete.
  //
  // Idempotent on the way in: an already-published paper keeps its original
  // timestamp. Overwriting it would silently re-sort the Library, pushing a
  // year-old paper to the top of "newest first" because someone re-saved it.
  if (updates.isEPaper !== undefined) {
    patch.e_paper_at = updates.isEPaper
      ? existing.ePaperAt ?? new Date().toISOString()
      : null;
  }

  const { error } = await supabase.from("assessments").update(patch).eq("id", existing.id);
  if (error) throw new Error(error.message);

  if (updates.targets) await replaceTargets(existing.id, updates.targets);
}

/**
 * Clone an assessment as a new draft — same title (suffixed), time limit,
 * instructions, audience and questions, but its own fresh system id and no
 * submissions. Draft status means saveQuestions' "already sat" lock can
 * never apply to the copy, even if the source is closed with years of
 * results behind it.
 */
export async function duplicateAssessment(sourceSystemId: string, createdBy: string): Promise<Assessment> {
  const source = await getAssessmentBySystemId(sourceSystemId);
  if (!source) throw new UserFacingError("Assessment not found");

  const questions = await getQuestions(source.id);

  const copy = await createAssessment({
    title: `${source.title} (Copy)`,
    description: source.description,
    timeLimit: source.timeLimit,
    instructions: source.instructions,
    status: "draft",
    createdBy,
    targets: source.targets.map((t) => ({
      schoolId: t.schoolId,
      level: t.level,
      classId: t.classId,
      studentId: t.studentId,
    })),
  });

  if (questions.length > 0) {
    await saveQuestions(
      copy.id,
      questions.map((q) => ({
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
        correctAnswer: q.correctAnswer,
        modelAnswer: q.modelAnswer,
        imageUrl: q.imageUrl,
        imagePublicId: q.imagePublicId,
        maxScore: q.maxScore,
        config: q.config,
      }))
    );
  }

  return copy;
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

/**
 * Removes an assessment from every other role's lists without deleting it —
 * for test-phase papers a super_admin wants out of everyone's way. Reversible
 * via unhideAssessment. Distinct from softDeleteAssessment: a hidden
 * assessment is still fully live (still gradeable, still counted in
 * analytics) for whoever already has it open by id.
 */
export async function hideAssessment(systemId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("assessments")
    .update({ hidden_at: new Date().toISOString() })
    .eq("system_id", systemId);
  if (error) throw new Error(error.message);
}

export async function unhideAssessment(systemId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("assessments")
    .update({ hidden_at: null })
    .eq("system_id", systemId);
  if (error) throw new Error(error.message);
}

/**
 * Flips whether this assessment's marks count toward the blended performance
 * figure — super_admin-only, same as hide/unhide. Sitting, marking, and
 * results-release are untouched; this only changes what the leaderboards,
 * benchmark, and student/parent "overall" figure include.
 */
export async function setAssessmentEvaluation(systemId: string, includeInEvaluation: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("assessments")
    .update({ include_in_evaluation: includeInEvaluation })
    .eq("system_id", systemId);
  if (error) throw new Error(error.message);
}

// ─── Collaborators ──────────────────────────────────────────

export interface AssessmentCollaborator {
  id: string; // profile id
  name: string;
  systemId: string | null;
}

/** Current collaborators on an assessment, with names for display. */
export async function getAssessmentCollaborators(
  assessmentId: string
): Promise<AssessmentCollaborator[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_collaborators")
    .select("staff:profiles!assessment_collaborators_staff_id_fkey(id, first_name, last_name, system_id)")
    .eq("assessment_id", assessmentId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => row.staff)
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => ({
      id: s.id,
      name: [s.first_name, s.last_name].filter(Boolean).join(" "),
      systemId: s.system_id,
    }));
}

/**
 * Grants a teacher edit+mark access to one assessment. Silently a no-op if
 * they already have it — adding someone twice is not an error a caller
 * needs to see.
 */
export async function addAssessmentCollaborator(
  assessmentId: string,
  staffId: string,
  addedBy: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("assessment_collaborators")
    .upsert(
      { assessment_id: assessmentId, staff_id: staffId, added_by: addedBy },
      { onConflict: "assessment_id,staff_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

export async function removeAssessmentCollaborator(
  assessmentId: string,
  staffId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("assessment_collaborators")
    .delete()
    .eq("assessment_id", assessmentId)
    .eq("staff_id", staffId);
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
/**
 * Mirrors the database's questions_choices_ck / questions_answerable_ck /
 * questions_correct_in_options_ck constraints, in the author's language.
 *
 * This runs BEFORE the questions are replaced, for two reasons. The obvious
 * one is that a constraint violation reaches the author as "Q3: tick at least
 * one correct choice" instead of a bare "Save failed". The important one is
 * that saveQuestions deletes the whole paper before re-inserting it: a
 * rejected insert used to leave the assessment with NO questions at all, so
 * the failure that told the author nothing also destroyed their work.
 */
function validateQuestions(questions: Omit<Question, "id" | "position" | "code">[], codes: string[]): void {
  questions.forEach((q, i) => {
    const label = codes[i];

    if (!q.questionText?.trim()) {
      throw new UserFacingError(`${label}: the question text is empty.`);
    }

    // A lettered part immediately followed by its roman-numeral children is
    // a stem/prompt only ("Identify the parts labelled:") — the children
    // carry the actual type, options, answer, and marks, so none of that
    // applies to this row itself. See isStemParent in questionGrouping.ts.
    if (isStemParent(questions, i)) {
      if (q.maxScore !== 0) {
        throw new UserFacingError(
          `${label}: this is a stem for the parts below it, not its own question — it can't carry marks.`
        );
      }
      return;
    }

    const options = (q.questionType === "true_false" ? TRUE_FALSE_OPTIONS : q.options ?? [])
      .map((o) => o.trim())
      .filter(Boolean);
    const answer = q.correctAnswer?.trim() ?? "";

    if (["mcq", "checkbox", "true_false"].includes(q.questionType) && options.length === 0) {
      throw new UserFacingError(`${label}: add at least one choice.`);
    }

    if (["mcq", "checkbox", "true_false", "fill"].includes(q.questionType) && !answer) {
      throw new UserFacingError(
        q.questionType === "checkbox"
          ? `${label}: tick at least one correct choice.`
          : `${label}: choose the correct answer.`
      );
    }

    // A choice that was ticked and then renamed or deleted leaves an answer
    // pointing at something that no longer exists. Auto-scoring would give
    // every learner zero, so the database refuses it — say which one.
    const chosen = q.questionType === "checkbox" ? answer.split("|").map((a) => a.trim()).filter(Boolean) : [answer];
    if (["mcq", "checkbox", "true_false"].includes(q.questionType)) {
      const orphan = chosen.find((a) => !options.includes(a));
      if (orphan) {
        throw new UserFacingError(
          `${label}: "${orphan}" is marked correct but is not one of the choices — re-tick the correct choice(s).`
        );
      }
    }

    if (!(q.maxScore > 0)) {
      throw new UserFacingError(`${label}: marks must be greater than zero.`);
    }
  });
}

export async function saveQuestions(
  assessmentId: string,
  questions: Omit<Question, "id" | "position" | "code">[]
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // The single source of truth for numbering — position/code are no longer
  // accepted from callers (both save routes used to force-write their own
  // Q1/Q2/Q3 here independently). A 'sub' group (22a, 22b, 22c) consumes one
  // number for the whole run; everything else, including every member of a
  // 'relative' group, consumes its own. See lib/questionGrouping.ts.
  const codes = computeCodes(questions);

  // Before anything is deleted.
  validateQuestions(questions, codes);

  const { count, error: countError } = await supabase
    .from("assessment_submissions")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId);
  if (countError) throw new Error(countError.message);
  if (count && count > 0) {
    throw new UserFacingError(
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
    position: index + 1,
    code: codes[index],
    question_text: q.questionText,
    type: q.questionType,
    // True/false always has the same two options — taking them from the author
    // would let "Ture" through and break auto-scoring.
    options: q.questionType === "true_false" ? TRUE_FALSE_OPTIONS : (q.options ?? []),
    correct_answer: q.correctAnswer ?? null,
    model_answer: q.modelAnswer?.trim() || null,
    image_url: q.imageUrl ?? null,
    image_public_id: q.imagePublicId ?? null,
    max_score: q.maxScore,
    config: (q.config ?? null) as never,
  }));

  const { error } = await supabase.from("questions").insert(rows);
  if (error) {
    // validateQuestions should have caught anything the constraints reject, so
    // reaching here means they disagree. The old questions are already gone,
    // and the author must be told that rather than left assuming a no-op.
    console.error("Question insert failed after delete:", error.message);
    throw new UserFacingError(
      "The questions could not be saved and the previous version has been cleared — your entries are still on screen, so fix the flagged question and save again before leaving this page.",
      500
    );
  }
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

/**
 * Clear a learner's sitting so they can take the paper again — for a teacher
 * to use when a learner submitted blank, or gave up partway through.
 *
 * Deletes the submission (cascading its responses and any scans) and the
 * sitting row that anchored its clock, so `assessments_for_student` (see
 * 07-sitting-once.sql) stops excluding this assessment for them and
 * `startOrResumeSitting` hands out a fresh start time rather than resuming
 * the old one. The paper itself still has to be open (published, within its
 * window) for the learner to see it again — this only undoes the "already
 * sat it" side of the lock.
 */
export async function allowResit(assessmentId: string, submissionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: submission, error: fetchError } = await supabase
    .from("assessment_submissions")
    .select("id, assessment_id, student_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!submission || submission.assessment_id !== assessmentId) {
    throw new UserFacingError("Submission not found for this assessment.", 404);
  }

  const { error: sittingError } = await supabase
    .from("assessment_sittings")
    .delete()
    .eq("assessment_id", submission.assessment_id)
    .eq("student_id", submission.student_id);
  if (sittingError) throw new Error(sittingError.message);

  const { error: deleteError } = await supabase
    .from("assessment_submissions")
    .delete()
    .eq("id", submission.id);
  if (deleteError) throw new Error(deleteError.message);
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
/** How a single answer turned out. */
export type AnswerVerdict = "correct" | "partial" | "wrong" | "unmarked";

export interface MarkedAnswer {
  questionId: string;
  position: number;
  code: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  imageUrl?: string;
  givenAnswer: string;
  correctAnswer?: string;
  modelAnswer?: string;
  score: number | null;
  maxScore: number;
  verdict: AnswerVerdict;
  config?: QuestionConfig;
}

export interface MarkedScript {
  studentId: string;
  assessmentSystemId: string;
  assessmentTitle: string;
  studentName: string;
  studentSystemId: string | null;
  school: string;
  className: string;
  submittedAt: string;
  totalScore: number | null;
  maxScore: number;
  percentage: number | null;
  releasedAt: string | null;
  answers: MarkedAnswer[];
}

function verdictFor(score: number | null, maxScore: number): AnswerVerdict {
  if (score === null) return "unmarked";
  if (score >= maxScore) return "correct";
  if (score <= 0) return "wrong";
  return "partial";
}

/**
 * One learner's whole paper: every question in order, what they answered, what
 * was correct, and the marks awarded.
 *
 * Questions are the spine rather than responses, so a question the learner
 * skipped still appears — an absent answer is information, and dropping the row
 * would silently renumber their paper.
 */
/**
 * Every learner's script for one assessment, in the order they are listed.
 *
 * Sequential rather than parallel: this is a printing path, not a hot one, and
 * a class of forty firing forty concurrent query bundles at Supabase is a good
 * way to get rate-limited mid-download.
 *
 * `opts.schoolId` narrows to one school's scripts — used by school_admin, so
 * a bulk download on a multi-school assessment never bundles another
 * school's learners into the same file.
 */
export async function getAllMarkedScripts(
  assessmentId: string,
  opts?: { schoolId?: string }
): Promise<MarkedScript[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("assessment_submissions")
    .select("student_id, enrollment:enrollments!inner(school_id)")
    .eq("assessment_id", assessmentId);
  if (opts?.schoolId) query = query.eq("enrollment.school_id", opts.schoolId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const scripts: MarkedScript[] = [];
  for (const row of data ?? []) {
    const script = await getMarkedScript(assessmentId, row.student_id);
    if (script) scripts.push(script);
  }
  return scripts.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

export async function getMarkedScript(
  assessmentId: string,
  studentId: string
): Promise<MarkedScript | null> {
  const supabase = getSupabaseAdmin();

  const { data: submission, error } = await supabase
    .from("assessment_submissions")
    .select(RESULT_COLUMNS)
    .eq("assessment_id", assessmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!submission) return null;

  const row = submission as unknown as ResultRow;
  const [assessment, questions] = await Promise.all([
    getAssessmentById(assessmentId),
    getQuestions(assessmentId),
  ]);
  if (!assessment) return null;

  const { data: responses, error: responseError } = await supabase
    .from("responses")
    .select("question_id, answer, score")
    .eq("submission_id", row.id);
  if (responseError) throw new Error(responseError.message);

  const byQuestion = new Map((responses ?? []).map((r) => [r.question_id, r]));

  const answers: MarkedAnswer[] = questions.map((q) => {
    const response = byQuestion.get(q.id);
    const score = response?.score === null || response?.score === undefined ? null : Number(response.score);
    return {
      questionId: q.id,
      position: q.position,
      code: q.code,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      imageUrl: q.imageUrl,
      givenAnswer: response?.answer ?? "",
      correctAnswer: q.correctAnswer,
      modelAnswer: q.modelAnswer,
      score,
      maxScore: q.maxScore,
      verdict: verdictFor(score, q.maxScore),
      config: q.config,
    };
  });

  const student = row.student;
  const enrollment = row.enrollment;
  const total = row.total_score === null ? null : Number(row.total_score);
  const maxScore = questions.reduce((sum, q) => sum + q.maxScore, 0);

  return {
    studentId,
    assessmentSystemId: assessment.systemId,
    assessmentTitle: assessment.title,
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
    totalScore: total,
    maxScore,
    percentage:
      total !== null && maxScore > 0 ? Math.round((total / maxScore) * 1000) / 10 : null,
    releasedAt: assessment.resultsReleasedAt ?? null,
    answers,
  };
}

/**
 * The assessment a response belongs to.
 *
 * Needed for authorisation: a response id on its own says nothing about who
 * owns the paper, so marking has to walk back to the assessment before it can
 * decide whether the caller may touch it.
 */
export async function getAssessmentForResponse(responseId: string): Promise<Assessment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("responses")
    .select("submission:assessment_submissions!inner(assessment_id)")
    .eq("id", responseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const assessmentId = (data as { submission?: { assessment_id: string } } | null)?.submission?.assessment_id;
  return assessmentId ? getAssessmentById(assessmentId) : null;
}

/** Internal lookup by uuid, for callers that already resolved the assessment. */
async function getAssessmentById(assessmentId: string): Promise<Assessment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("id", assessmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToAssessment(data as unknown as AssessmentRow) : null;
}

// PostgREST refuses to return more than max-rows (1000 on this project) from a
// single request, and — this is the dangerous part — says nothing about having
// truncated. You get 1000 rows back and error: null, indistinguishable from a
// table that genuinely holds 1000 rows.
//
// That is what broke marking on ASS0025: 46 submissions x 25 questions = 1150
// responses, of which the marking screen saw 1000. The 150 it could not see
// had no response id to score against, so those answers failed with "That
// question has no recorded answer to mark" and four learners could not be
// marked at all.
//
// Raising max-rows is not the fix — it moves the same failure to a bigger
// number and swaps a wrong answer for a timeout. Reads that grow with the
// school either ask for less (see getResponses' submissionId) or come through
// here.
const PAGE_SIZE = 1000;

/**
 * Every row a query matches, read a page at a time.
 *
 * `page` must apply a total ordering — a sort with ties lets Postgres return
 * tied rows in any order it likes per request, so pages overlap and drop rows.
 * That would be the same truncation bug wearing a different hat, and just as
 * quiet, so order by something unique or add a unique tiebreaker.
 *
 * Throws rather than returning what it managed to collect: a short list that
 * reads as complete is exactly the failure this exists to prevent.
 */
export async function readAllPages<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getResponses(
  assessmentId: string,
  submissionId?: string
): Promise<ResponseRecord[]> {
  const supabase = getSupabaseAdmin();

  // Pass submissionId to read one learner's paper. Marking never needs more
  // than that, and asking for one paper is what keeps this bounded by the
  // question count (25 rows) rather than by the number of learners who sat the
  // exam. The whole-assessment form remains for callers that genuinely want
  // every paper.
  const rows = await readAllPages<ResponseRow>((from, to) => {
    let query = supabase
      .from("responses")
      .select(RESPONSE_COLUMNS)
      // Kept even when submissionId is given: it constrains the submission to
      // this assessment, so a submission id belonging to someone else's paper
      // returns nothing rather than leaking it past the caller's authorisation.
      .eq("submission.assessment_id", assessmentId);
    if (submissionId) query = query.eq("submission_id", submissionId);
    return query.order("id", { ascending: true }).range(from, to);
  });

  return rows.map((row) => {
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

/** Whether every response on this assessment has been marked. */
export async function isFullyMarked(assessmentId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("assessment_is_fully_marked", {
    p_assessment: assessmentId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * Tells the learners their results are available.
 *
 * Refused until every response is marked: a learner opening a half-scored
 * paper reads it as their actual result, and there is no way to un-tell them.
 * Marking finishing is a fact; releasing is a decision, which is why this is an
 * explicit action rather than a trigger on the last score being entered.
 */
export async function releaseResults(
  assessmentId: string,
  releasedBy: string
): Promise<{ notified: number }> {
  const supabase = getSupabaseAdmin();

  if (!(await isFullyMarked(assessmentId))) {
    throw new UserFacingError(
      "Results cannot be released until every response has been marked."
    );
  }

  const { data: assessment, error: readError } = await supabase
    .from("assessments")
    .select("system_id, title, results_released_at")
    .eq("id", assessmentId)
    .single();
  if (readError) throw new Error(readError.message);
  if (assessment.results_released_at) {
    throw new UserFacingError("Results for this assessment have already been released.");
  }

  const { error } = await supabase
    .from("assessments")
    .update({ results_released_at: new Date().toISOString(), results_released_by: releasedBy })
    .eq("id", assessmentId);
  if (error) throw new Error(error.message);

  const { data: submissions } = await supabase
    .from("assessment_submissions")
    .select("student_id")
    .eq("assessment_id", assessmentId);

  // One notification per learner rather than a broadcast: only those who
  // actually sat it have a result to read.
  for (const s of submissions ?? []) {
    await notify({
      type: "results_released",
      title: `Results are out: ${assessment.title}`,
      body: "Your marked paper is now available to view and download.",
      audience: { profileId: s.student_id },
      entityType: "assessments",
      entityId: assessment.system_id,
      link: `/student/results/${assessment.system_id}`,
      createdBy: releasedBy,
    });
  }

  return { notified: submissions?.length ?? 0 };
}

export interface AssessmentResult {
  submissionId: string;
  /** Needed to open that learner's script; results are per submission. */
  studentId: string;
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
  student_id: string;
  submitted_at: string;
  time_spent_seconds: number;
  total_score: number | null;
  max_score: number | null;
  status: string;
  student: { system_id: string | null; first_name: string; middle_name: string | null; last_name: string } | null;
  enrollment: {
    school_id: string;
    school: { name: string } | null;
    class: { alias: string | null; grade_level: { code: string } | null } | null;
    stream: { name: string } | null;
  } | null;
}

// Same disambiguation as RESPONSE_COLUMNS: student_id, not marked_by.
//
// enrollments is `!inner` (rather than the default left embed) so that a
// schoolId scope can filter on the joined table at all — PostgREST only
// allows `.eq()` on an embedded resource when the embed is inner. Safe here
// because assessment_submissions.enrollment_id is NOT NULL, so no row is
// dropped by the switch — see LEADERBOARD_COLUMNS in
// lib/entities/performance.ts for the same reasoning.
const RESULT_COLUMNS =
  "id, student_id, submitted_at, time_spent_seconds, total_score, max_score, status, student:profiles!assessment_submissions_student_id_fkey(system_id, first_name, middle_name, last_name), enrollment:enrollments!inner(school_id, school:schools(name), class:classes(alias, grade_level:grade_levels(code)), stream:streams(name))";

/**
 * One row per student who sat the assessment, with their marked total.
 *
 * Totals come from the submission, which a database trigger keeps in step with
 * the individual responses — so this can never report a score that disagrees
 * with the answers behind it.
 *
 * `opts.schoolId` narrows to one school's submissions — used by school_admin
 * routes, which must never see another school's students even on an
 * assessment targeted at multiple schools.
 */
export async function getAssessmentResults(
  assessmentId: string,
  opts?: { schoolId?: string }
): Promise<AssessmentResult[]> {
  const supabase = getSupabaseAdmin();

  // Grows with the number of learners who sat the exam, so it pages. An exam
  // with more than 1000 sitters would otherwise return the first 1000 and look
  // complete — markers would simply never see the rest of the register, with
  // nothing on screen to suggest anyone was missing.
  //
  // submitted_at alone is not a total order (a class submitting together ties
  // to the second), so id breaks the tie and keeps the pages from overlapping.
  const rows = await readAllPages<ResultRow>((from, to) => {
    let query = supabase
      .from("assessment_submissions")
      .select(RESULT_COLUMNS)
      .eq("assessment_id", assessmentId);
    if (opts?.schoolId) query = query.eq("enrollment.school_id", opts.schoolId);
    return query.order("submitted_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
  });

  return rows.map((row) => {
    const student = row.student;
    const enrollment = row.enrollment;
    const total = row.total_score === null ? null : Number(row.total_score);
    const max = row.max_score === null ? null : Number(row.max_score);
    return {
      submissionId: row.id,
      studentId: row.student_id,
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

export interface MyAssessmentAttempt {
  assessmentSystemId: string;
  title: string;
  submittedAt: string;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  /** Nothing about a script is visible to the learner until this is true — same rule getMarkedScript's caller enforces. */
  released: boolean;
}

interface MyAttemptRow {
  submitted_at: string;
  total_score: number | null;
  max_score: number | null;
  status: string;
  assessment: { system_id: string; title: string; results_released_at: string | null } | null;
}

const MY_ATTEMPT_COLUMNS =
  "submitted_at, total_score, max_score, status, assessment:assessments(system_id, title, results_released_at)";

/**
 * Every assessment a student has ever sat, newest first — what the "My
 * Results" screen shows so a learner isn't solely dependent on noticing the
 * results_released notification to know a score is ready.
 */
export async function getMyAssessmentAttempts(studentId: string): Promise<MyAssessmentAttempt[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select(MY_ATTEMPT_COLUMNS)
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data as unknown as MyAttemptRow[])
    .filter((row) => row.assessment !== null)
    .map((row) => {
      const total = row.total_score === null ? null : Number(row.total_score);
      const max = row.max_score === null ? null : Number(row.max_score);
      return {
        assessmentSystemId: row.assessment!.system_id,
        title: row.assessment!.title,
        submittedAt: row.submitted_at,
        totalScore: total,
        maxScore: max,
        // Same rule as getAssessmentResults: only meaningful once marking is
        // finished, or a partial total reads as a low score instead of an
        // incomplete one.
        percentage:
          row.status === "marked" && total !== null && max !== null && max > 0
            ? Math.round((total / max) * 1000) / 10
            : null,
        released: row.assessment!.results_released_at !== null,
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

// ─── Marking reminders ────────────────────────────────────

/** An assessment with scripts sat but not finished being marked. */
export interface AwaitingMarking {
  id: string;
  systemId: string;
  title: string;
  /**
   * Submissions still sitting at 'submitted'. recalc_submission_score()
   * (03-collection.sql) moves a submission to 'marked' only once every one of
   * its answers has a score, and moves it back the moment one doesn't — so
   * this cannot drift from what the marking screen shows.
   *
   * 'in_progress' is deliberately excluded: a script nobody has handed in is
   * not waiting on a marker, and counting it would nag a teacher about work
   * they cannot do.
   */
  pendingScripts: number;
  createdBy: string | null;
  collaboratorIds: string[];
}

/**
 * Every assessment with marking outstanding, newest first.
 *
 * Released assessments are skipped without a query: releasing is refused until
 * an assessment is fully marked (see releaseResults), so a released one has
 * nothing pending by construction.
 */
export async function listAssessmentsAwaitingMarking(): Promise<AwaitingMarking[]> {
  const supabase = getSupabaseAdmin();
  const candidates = (await getAssessments()).filter((a) => !a.resultsReleasedAt);

  const awaiting: AwaitingMarking[] = [];
  for (const assessment of candidates) {
    const { count, error } = await supabase
      .from("assessment_submissions")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", assessment.id)
      .eq("status", "submitted");
    if (error) throw new Error(error.message);

    if ((count ?? 0) > 0) {
      awaiting.push({
        id: assessment.id,
        systemId: assessment.systemId,
        title: assessment.title,
        pendingScripts: count ?? 0,
        createdBy: assessment.createdBy,
        collaboratorIds: assessment.collaboratorIds,
      });
    }
  }
  return awaiting;
}

/** School-wide marking totals — how far a school's teachers have gotten through marking, not per-assessment. */
export interface SchoolMarkingProgress {
  totalScripts: number;
  markedScripts: number;
  /** 'submitted' only — a script nobody has handed in yet isn't waiting on a marker, same convention as AwaitingMarking. */
  pendingScripts: number;
  fullyMarkedPapers: number;
  /** Papers with at least one submission from this school — the denominator fullyMarkedPapers is out of. */
  totalPapers: number;
}

/**
 * Every submission across a school's assessments, marked or not — the
 * aggregate `listAssessmentsAwaitingMarking` doesn't give you, since that
 * one only ever looks at the unmarked side, one assessment at a time.
 */
export async function getSchoolMarkingProgress(schoolId: string): Promise<SchoolMarkingProgress> {
  const supabase = getSupabaseAdmin();

  interface Row {
    assessment_id: string;
    status: string;
  }
  const rows = await readAllPages<Row>((from, to) =>
    supabase
      .from("assessment_submissions")
      .select("assessment_id, status, enrollment:enrollments!inner(school_id)")
      .eq("enrollment.school_id", schoolId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const byAssessment = new Map<string, { total: number; marked: number }>();
  let markedScripts = 0;
  let pendingScripts = 0;
  for (const row of rows) {
    const bucket = byAssessment.get(row.assessment_id) ?? { total: 0, marked: 0 };
    bucket.total += 1;
    if (row.status === "marked") {
      bucket.marked += 1;
      markedScripts += 1;
    } else if (row.status === "submitted") {
      pendingScripts += 1;
    }
    byAssessment.set(row.assessment_id, bucket);
  }

  let fullyMarkedPapers = 0;
  for (const bucket of byAssessment.values()) {
    if (bucket.total > 0 && bucket.total === bucket.marked) fullyMarkedPapers += 1;
  }

  return {
    totalScripts: rows.length,
    markedScripts,
    pendingScripts,
    fullyMarkedPapers,
    totalPapers: byAssessment.size,
  };
}

/**
 * Same totals as {@link getSchoolMarkingProgress}, but across every school —
 * the super_admin assessments list's marking-progress panel, unscoped.
 */
export async function getSystemMarkingProgress(): Promise<SchoolMarkingProgress> {
  const supabase = getSupabaseAdmin();

  interface Row {
    assessment_id: string;
    status: string;
  }
  const rows = await readAllPages<Row>((from, to) =>
    supabase
      .from("assessment_submissions")
      .select("assessment_id, status")
      .order("id", { ascending: true })
      .range(from, to)
  );

  const byAssessment = new Map<string, { total: number; marked: number }>();
  let markedScripts = 0;
  let pendingScripts = 0;
  for (const row of rows) {
    const bucket = byAssessment.get(row.assessment_id) ?? { total: 0, marked: 0 };
    bucket.total += 1;
    if (row.status === "marked") {
      bucket.marked += 1;
      markedScripts += 1;
    } else if (row.status === "submitted") {
      pendingScripts += 1;
    }
    byAssessment.set(row.assessment_id, bucket);
  }

  let fullyMarkedPapers = 0;
  for (const bucket of byAssessment.values()) {
    if (bucket.total > 0 && bucket.total === bucket.marked) fullyMarkedPapers += 1;
  }

  return {
    totalScripts: rows.length,
    markedScripts,
    pendingScripts,
    fullyMarkedPapers,
    totalPapers: byAssessment.size,
  };
}

/** One assessment as it appears in a person's reminder. */
export interface MarkingReminderItem {
  systemId: string;
  title: string;
  pendingScripts: number;
  /** They wrote the paper, rather than being added to it as a collaborator. */
  isAuthor: boolean;
}

/** What one person is being reminded about. */
export interface MarkingReminder {
  staffId: string;
  name: string;
  /**
   * Null when there is no real address on file — that person still gets the
   * in-app notification, they just cannot be emailed.
   */
  email: string | null;
  totalScripts: number;
  /** Most outstanding first, so the email leads with the worst backlog. */
  assessments: MarkingReminderItem[];
}

/**
 * Who to remind, and about what.
 *
 * Addressed to the author and their collaborators specifically, rather than to
 * every teacher who *could* mark the paper (getMarkableAssessments is wider —
 * it also lets a school's teachers mark admin-authored papers aimed at their
 * school). Those two are the people who own the marking; broadcasting to the
 * rest would be nagging people about work that isn't theirs, and reminders
 * that don't apply to you are the fastest way to teach a staff room to ignore
 * the bell.
 *
 * Inactive profiles are dropped: someone who has left should not be chased,
 * and their assessment's remaining recipients still get the reminder.
 */
export async function listMarkingReminders(): Promise<MarkingReminder[]> {
  const awaiting = await listAssessmentsAwaitingMarking();

  const byStaff = new Map<string, MarkingReminderItem[]>();
  const add = (staffId: string, item: MarkingReminderItem) => {
    const existing = byStaff.get(staffId);
    if (existing) existing.push(item);
    else byStaff.set(staffId, [item]);
  };

  for (const assessment of awaiting) {
    const item = {
      systemId: assessment.systemId,
      title: assessment.title,
      pendingScripts: assessment.pendingScripts,
    };
    if (assessment.createdBy) add(assessment.createdBy, { ...item, isAuthor: true });
    for (const staffId of assessment.collaboratorIds) {
      // An author who is also listed as a collaborator is reminded once, as
      // the author.
      if (staffId === assessment.createdBy) continue;
      add(staffId, { ...item, isAuthor: false });
    }
  }

  if (byStaff.size === 0) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, contact_email, email")
    .in("id", [...byStaff.keys()])
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((profile) => {
      const assessments = (byStaff.get(profile.id) ?? []).sort(
        (a, b) => b.pendingScripts - a.pendingScripts
      );
      // contact_email is the human-facing address; email is Supabase Auth's
      // identifier, which falls back to a placeholder for anyone created
      // without a real one — so that placeholder is discarded, not mailed to.
      const address = profile.contact_email || profile.email;
      return {
        staffId: profile.id,
        name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "there",
        email:
          address && !address.endsWith(`@${STUDENT_PLACEHOLDER_DOMAIN}`) ? address : null,
        totalScripts: assessments.reduce((sum, a) => sum + a.pendingScripts, 0),
        assessments,
      };
    })
    .sort((a, b) => b.totalScripts - a.totalScripts);
}
