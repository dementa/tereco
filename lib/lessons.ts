import { getSupabaseAdmin } from "./supabase";

/**
 * A filed lesson report, flattened for display.
 *
 * The school/class/stream names are RESOLVED THROUGH JOINS, not stored on the
 * report. The previous version kept `school text` and `class_name text`, which
 * meant a school renaming P.4 to "J4" silently rewrote its own history.
 */
export interface LessonRecord {
  id: string;
  school: string;
  className: string;
  streamName: string;
  lessonDate: string;
  period: number;
  status: string;
  missedReason: string;
  missedExplanation: string;
  learningArea: string;
  specificSkill: string;
  approach: string;
  present: number;
  absent: number;
  computerAccess: string;
  overallProgress: string;
  achievement: string;
  hadChallenges: boolean;
  challengeDetails: string;
  supportRequired: string;
  reference: string;
  teacher: string;
  createdAt: string;
}

interface LessonRow {
  id: string;
  lesson_date: string;
  period: number;
  status: string;
  missed_reason: string;
  missed_explanation: string;
  learning_area: string;
  specific_skill: string;
  approach: string;
  present: number;
  absent: number;
  computer_access: string;
  overall_progress: string;
  achievement: string;
  had_challenges: boolean;
  challenge_details: string;
  support_required: string;
  reference: string;
  created_at: string;
  school: { name: string } | null;
  class: { level: number | null; alias: string | null; grade_level: { code: string } | null } | null;
  stream: { name: string } | null;
  staff: { first_name: string; middle_name: string | null; last_name: string } | null;
}

// Single string literal: the Supabase client infers the row shape from this
// select's literal type, and concatenation would widen it to `string`.
const LESSON_COLUMNS =
  "id, lesson_date, period, status, missed_reason, missed_explanation, learning_area, specific_skill, approach, present, absent, computer_access, overall_progress, achievement, had_challenges, challenge_details, support_required, reference, created_at, school:schools(name), class:classes(level, alias, grade_level:grade_levels(code)), stream:streams(name), staff:profiles(first_name, middle_name, last_name)";

function rowToLesson(row: LessonRow): LessonRecord {
  const staff = row.staff;
  return {
    id: row.id,
    school: row.school?.name ?? "",
    // Same display rule as everywhere else: the school's own alias, else the
    // canonical P.n code.
    className: row.class?.alias ?? row.class?.grade_level?.code ?? "",
    streamName: row.stream?.name ?? "",
    lessonDate: row.lesson_date,
    period: row.period,
    status: row.status,
    missedReason: row.missed_reason,
    missedExplanation: row.missed_explanation,
    learningArea: row.learning_area,
    specificSkill: row.specific_skill,
    approach: row.approach,
    present: row.present,
    absent: row.absent,
    computerAccess: row.computer_access,
    overallProgress: row.overall_progress,
    achievement: row.achievement,
    hadChallenges: row.had_challenges,
    challengeDetails: row.challenge_details,
    supportRequired: row.support_required,
    reference: row.reference,
    teacher: staff
      ? [staff.first_name, staff.middle_name, staff.last_name].filter(Boolean).join(" ").trim()
      : "",
    createdAt: row.created_at,
  };
}

export interface LessonFilters {
  schoolId?: string;
  classId?: string;
  staffId?: string;
  termId?: string;
  from?: string; // ISO date, inclusive
  to?: string; // ISO date, inclusive
  limit?: number;
}

export async function getLessons(filters: LessonFilters = {}): Promise<LessonRecord[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase.from("lesson_reports").select(LESSON_COLUMNS);

  if (filters.schoolId) query = query.eq("school_id", filters.schoolId);
  if (filters.classId) query = query.eq("class_id", filters.classId);
  if (filters.staffId) query = query.eq("staff_id", filters.staffId);
  if (filters.termId) query = query.eq("term_id", filters.termId);
  if (filters.from) query = query.gte("lesson_date", filters.from);
  if (filters.to) query = query.lte("lesson_date", filters.to);

  const { data, error } = await query
    .order("lesson_date", { ascending: false })
    .order("period", { ascending: true })
    .limit(filters.limit ?? 500);

  if (error) {
    console.error("Error fetching lessons:", error);
    return [];
  }
  return (data as unknown as LessonRow[]).map(rowToLesson);
}
