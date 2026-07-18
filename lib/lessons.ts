import { getSupabaseAdmin } from "./supabase";

export interface LessonRecord {
  id: string;
  school: string;
  className: string;
  lessonDate: string;
  period: string;
  status: string;
  learningArea: string;
  specificSkill: string;
  approach: string;
  present: number;
  absent: number;
  computerAccess: string;
  overallProgress: string;
  achievement: string;
  challenges: string;
  challengeDetails: string;
  supportRequired: string;
  reference: string;
  teacher: string;
  createdAt: string;
}

interface LessonRow {
  id: string;
  school: string | null;
  class_name: string | null;
  lesson_date: string | null;
  period: string | null;
  status: string | null;
  learning_area: string | null;
  specific_skill: string | null;
  approach: string | null;
  present: number | null;
  absent: number | null;
  computer_access: string | null;
  overall_progress: string | null;
  achievement: string | null;
  challenges: string | null;
  challenge_details: string | null;
  support_required: string | null;
  reference: string | null;
  teacher: string | null;
  created_at: string | null;
}

function rowToLesson(row: LessonRow): LessonRecord {
  return {
    id: row.id,
    school: row.school ?? "",
    className: row.class_name ?? "",
    lessonDate: row.lesson_date ?? "",
    period: row.period ?? "",
    status: row.status ?? "",
    learningArea: row.learning_area ?? "",
    specificSkill: row.specific_skill ?? "",
    approach: row.approach ?? "",
    present: row.present ?? 0,
    absent: row.absent ?? 0,
    computerAccess: row.computer_access ?? "",
    overallProgress: row.overall_progress ?? "",
    achievement: row.achievement ?? "",
    challenges: row.challenges ?? "",
    challengeDetails: row.challenge_details ?? "",
    supportRequired: row.support_required ?? "",
    reference: row.reference ?? "",
    teacher: row.teacher ?? "",
    createdAt: row.created_at ?? "",
  };
}

export async function getLessons(): Promise<LessonRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lesson_records")
    .select(
      "id, school, class_name, lesson_date, period, status, learning_area, specific_skill, approach, present, absent, computer_access, overall_progress, achievement, challenges, challenge_details, support_required, reference, teacher, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching lessons:", error);
    return [];
  }
  return (data ?? []).map(rowToLesson);
}
