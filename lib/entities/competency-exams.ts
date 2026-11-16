import { getSupabaseAdmin } from "@/lib/supabase";
import { createAssessment, getAssessmentBySystemId, hideAssessment } from "@/lib/assessments";
import { COMPETENCY_EXAM_TITLE_PREFIX, competencyExamName, competencyExamTitle } from "@/lib/competency-exam";

/**
 * Competency Examinations — practical exams marked Completed / Not completed /
 * Absent (see lib/competency-exam.ts for the 100 / 70 / 0 rule).
 *
 * Built the same way as the Behaviour Rating form: each exam is an ordinary
 * assessment, targeted at one school, hidden from the assessments lists and
 * released at creation. Marks are written by enterMarksDirectly as already
 * "marked" submissions out of 100, so they reach every place marks already go
 * — the learner's My Results, the parent's results, the term performance
 * figure and the leaderboards — with the term decided by the date the mark
 * was entered (inTerm() in lib/entities/performance.ts).
 *
 * Unlike Behaviour Rating there is one assessment PER EXAM, not one per
 * school: a school may run several practical exams in a term (different
 * modules), and a learner needs a separate mark for each. The exam is
 * recognised by its title prefix, so no schema change is needed.
 */

export interface CompetencyExamSummary {
  systemId: string;
  name: string;
  title: string;
  /** What the learner is asked to do — written by the teacher who started the exam. */
  instructions: string;
  createdAt: string;
  markedCount: number;
}

interface ExamRow {
  id: string;
  system_id: string;
  title: string;
  description: string | null;
  created_at: string;
  targets: { school_id: string | null; level: number | null; class_id: string | null; student_id: string | null }[] | null;
}

function isSchoolOnlyTarget(row: ExamRow, schoolId: string): boolean {
  const t = row.targets ?? [];
  return (
    t.length === 1 &&
    t[0].school_id === schoolId &&
    t[0].level === null &&
    t[0].class_id === null &&
    t[0].student_id === null
  );
}

async function listSchoolExamRows(schoolId: string): Promise<ExamRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessments")
    .select("id, system_id, title, description, created_at, targets:assessment_targets(school_id, level, class_id, student_id)")
    .like("title", `${COMPETENCY_EXAM_TITLE_PREFIX}%`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ExamRow[]).filter((row) => isSchoolOnlyTarget(row, schoolId));
}

/** This school's competency exams, newest first, with how many learners have a mark. */
export async function listCompetencyExams(schoolId: string): Promise<CompetencyExamSummary[]> {
  const rows = await listSchoolExamRows(schoolId);
  const supabase = getSupabaseAdmin();

  // One count per exam. A school runs a handful of these a term, so this
  // stays a handful of cheap head-only requests.
  const counts = await Promise.all(
    rows.map(async (row) => {
      const { count, error } = await supabase
        .from("assessment_submissions")
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", row.id)
        .eq("status", "marked");
      if (error) throw new Error(error.message);
      return count ?? 0;
    })
  );

  return rows.map((row, i) => ({
    systemId: row.system_id,
    name: competencyExamName(row.title),
    title: row.title,
    instructions: row.description ?? "",
    createdAt: row.created_at,
    markedCount: counts[i],
  }));
}

/**
 * Creates a competency exam for one school, named by the competency skill
 * being checked (e.g. "Creating a spreadsheet with formulas"), or returns the
 * existing exam for that same skill — so a double-tap on "Start exam", or two
 * teachers starting the same exam at once, lands everyone on one register
 * instead of splitting the marks across two.
 */
export async function createCompetencyExam(
  schoolId: string,
  skill: string,
  instructions: string,
  createdBy: string
): Promise<{ systemId: string; created: boolean }> {
  const title = competencyExamTitle(skill);
  const existing = (await listSchoolExamRows(schoolId)).find(
    (row) => row.title.toLowerCase() === title.toLowerCase()
  );
  if (existing) return { systemId: existing.system_id, created: false };

  const created = await createAssessment({
    title,
    // The assessment's description holds the task the learner is checked on,
    // so it travels with the exam wherever the exam is shown.
    description: instructions.trim(),
    timeLimit: 60,
    status: "closed",
    targets: [{ schoolId, level: null, classId: null, studentId: null }],
    createdBy,
  });

  // Hidden so it never clutters the assessments lists; released at creation
  // so learners and parents see each mark as soon as it is saved. Same
  // reasoning as getOrCreateBehaviorAssessment: there is no "Release
  // results" button anywhere a hidden assessment can be reached from, and
  // every mark is final when written.
  await hideAssessment(created.systemId);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("assessments")
    .update({ results_released_at: new Date().toISOString(), results_released_by: createdBy })
    .eq("id", created.id);
  if (error) throw new Error(error.message);

  return { systemId: created.systemId, created: true };
}

/** The exam, only if it is a competency exam belonging to this school. */
export async function getCompetencyExamForSchool(systemId: string, schoolId: string) {
  const assessment = await getAssessmentBySystemId(systemId);
  if (!assessment || !assessment.title.startsWith(COMPETENCY_EXAM_TITLE_PREFIX)) return null;
  const belongs =
    assessment.targets.length === 1 &&
    assessment.targets[0].schoolId === schoolId &&
    assessment.targets[0].classId === null &&
    assessment.targets[0].level === null;
  return belongs ? assessment : null;
}
