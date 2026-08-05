import { getSupabaseAdmin } from "@/lib/supabase";
import { getLessons, type LessonRecord } from "@/lib/lessons";

// ─── Windows ──────────────────────────────────────────────

export type AnalyticsPeriod = "day" | "week" | "month";

export interface PeriodWindow {
  period: AnalyticsPeriod;
  from: string; // ISO date, inclusive
  to: string; // ISO date, inclusive
  label: string;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing d, in UTC calendar terms. */
function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday;
}

/**
 * A calendar-aligned window: the day itself, its Monday–Sunday week, or its
 * 1st-to-last-day month — matching how terms and every other date range in
 * this app already read ("this week", "this month"), not a rolling N days.
 *
 * The end is capped at today when the window is still in progress. A
 * report for "this week" must never claim tomorrow filed zero lessons —
 * that reads as a shortfall instead of a day that hasn't happened yet.
 */
export function periodWindow(
  period: AnalyticsPeriod,
  referenceDate: string = toISODate(new Date())
): PeriodWindow {
  const ref = new Date(`${referenceDate}T00:00:00Z`);
  const today = toISODate(new Date());
  const cap = (iso: string) => (iso > today ? today : iso);

  if (period === "day") {
    return { period, from: referenceDate, to: referenceDate, label: referenceDate };
  }

  if (period === "week") {
    const monday = startOfWeek(ref);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const from = toISODate(monday);
    return { period, from, to: cap(toISODate(sunday)), label: `Week of ${from}` };
  }

  const first = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const last = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
  const from = toISODate(first);
  return { period, from, to: cap(toISODate(last)), label: from.slice(0, 7) };
}

// ─── Staff/admin rollup ─────────────────────────────────────

export interface AnalyticsScope {
  schoolId?: string;
  classId?: string;
  staffId?: string;
}

export type BreakdownDimension = "school" | "class" | "teacher";

export interface BreakdownRow {
  key: string;
  filed: number;
  reviewed: number;
}

export interface TrendPoint {
  date: string;
  filed: number;
}

export interface LessonAnalyticsSummary {
  window: PeriodWindow;
  lessonsFiled: number;
  reviewed: number;
  pendingReview: number;
  presentTotal: number;
  absentTotal: number;
  /** null when nobody has recorded attendance yet, rather than a misleading 0%. */
  attendanceRate: number | null;
  distinctSchools: number;
  distinctClasses: number;
  distinctTeachers: number;
  /** One point per date that had at least one filing — gaps are omitted, not zero-filled. */
  trend: TrendPoint[];
  breakdown: BreakdownRow[];
}

function breakdownKey(lesson: LessonRecord, dimension: BreakdownDimension): string {
  if (dimension === "school") return lesson.school || "—";
  if (dimension === "teacher") return lesson.teacher || "—";
  return lesson.streamName ? `${lesson.className} (${lesson.streamName})` : lesson.className || "—";
}

/**
 * The rollup behind every "how are we doing on lesson filing" view: super
 * admin (all schools), school admin (their school), and staff (their own
 * filings) all call this with a narrower scope and a different breakdown
 * dimension.
 *
 * Built on getLessons rather than a SQL aggregate — at pilot scale (dozens of
 * reports, ICT-only) fetching the window's rows and reducing in Node is
 * simpler and cannot disagree with what the lesson list itself shows.
 */
export async function getLessonAnalyticsSummary(
  scope: AnalyticsScope,
  period: AnalyticsPeriod,
  breakdownBy: BreakdownDimension,
  referenceDate?: string
): Promise<LessonAnalyticsSummary> {
  const window = periodWindow(period, referenceDate);
  const lessons = await getLessons({
    ...scope,
    from: window.from,
    to: window.to,
    // A school- or system-wide month can exceed getLessons' default cap of
    // 500; this rollup needs every row in the window, not a recent slice.
    limit: 5000,
  });

  const reviewed = lessons.filter((l) => l.reviewed).length;
  const presentTotal = lessons.reduce((sum, l) => sum + l.present, 0);
  const absentTotal = lessons.reduce((sum, l) => sum + l.absent, 0);

  // Every calendar date in the window, zero-filled. A day with no filings is
  // itself the signal a "keep them updated daily" view exists to surface —
  // silently omitting it (as a map keyed only on dates that occurred would)
  // hides exactly the gap a stakeholder is checking for.
  const byDate = new Map<string, number>();
  for (let d = new Date(`${window.from}T00:00:00Z`); toISODate(d) <= window.to; d.setUTCDate(d.getUTCDate() + 1)) {
    byDate.set(toISODate(d), 0);
  }

  const byKey = new Map<string, BreakdownRow>();
  for (const lesson of lessons) {
    byDate.set(lesson.lessonDate, (byDate.get(lesson.lessonDate) ?? 0) + 1);

    const key = breakdownKey(lesson, breakdownBy);
    const row = byKey.get(key) ?? { key, filed: 0, reviewed: 0 };
    row.filed += 1;
    if (lesson.reviewed) row.reviewed += 1;
    byKey.set(key, row);
  }

  return {
    window,
    lessonsFiled: lessons.length,
    reviewed,
    pendingReview: lessons.length - reviewed,
    presentTotal,
    absentTotal,
    attendanceRate: presentTotal + absentTotal > 0 ? presentTotal / (presentTotal + absentTotal) : null,
    distinctSchools: new Set(lessons.map((l) => l.school).filter(Boolean)).size,
    distinctClasses: new Set(lessons.map((l) => `${l.className}|${l.streamName}`)).size,
    distinctTeachers: new Set(lessons.map((l) => l.teacher).filter(Boolean)).size,
    trend: [...byDate.entries()]
      .map(([date, filed]) => ({ date, filed }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    breakdown: [...byKey.values()].sort((a, b) => b.filed - a.filed),
  };
}

// ─── Student feed ───────────────────────────────────────────

export interface ClassLessonFeedItem {
  lessonReportId: string;
  lessonDate: string;
  period: number;
  className: string;
  streamName: string;
  learningArea: string;
  specificSkill: string;
  approach: string;
  teacher: string;
  /** This student's own attendance for that lesson — not the class total. */
  present: boolean;
}

interface FeedRow {
  is_present: boolean;
  lesson_report: {
    id: string;
    lesson_date: string;
    period: number;
    learning_area: string;
    specific_skill: string;
    approach: string;
    class: { alias: string | null; grade_level: { code: string } | null } | null;
    stream: { name: string } | null;
    staff: { first_name: string; middle_name: string | null; last_name: string } | null;
  } | null;
}

/**
 * What a student sees: what was taught in the lessons they attended (or
 * missed), and their own attendance for each — never the teacher-facing
 * review status, challenges or support-required fields, which are about
 * managing staff, not informing a learner.
 */
export async function getClassLessonFeed(
  studentId: string,
  period: AnalyticsPeriod,
  referenceDate?: string
): Promise<{ window: PeriodWindow; items: ClassLessonFeedItem[] }> {
  const window = periodWindow(period, referenceDate);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("lesson_attendance")
    .select(
      "is_present, lesson_report:lesson_reports!inner(id, lesson_date, period, learning_area, specific_skill, approach, class:classes(alias, grade_level:grade_levels(code)), stream:streams(name), staff:profiles!lesson_reports_staff_id_fkey(first_name, middle_name, last_name))"
    )
    .eq("student_id", studentId)
    .gte("lesson_report.lesson_date", window.from)
    .lte("lesson_report.lesson_date", window.to);
  if (error) throw new Error(error.message);

  const items = (data as unknown as FeedRow[])
    .filter((row) => row.lesson_report !== null)
    .map((row) => {
      const report = row.lesson_report!;
      const staff = report.staff;
      return {
        lessonReportId: report.id,
        lessonDate: report.lesson_date,
        period: report.period,
        className: report.class?.alias ?? report.class?.grade_level?.code ?? "",
        streamName: report.stream?.name ?? "",
        learningArea: report.learning_area,
        specificSkill: report.specific_skill,
        approach: report.approach,
        teacher: staff
          ? [staff.first_name, staff.middle_name, staff.last_name].filter(Boolean).join(" ").trim()
          : "",
        present: row.is_present,
      };
    })
    .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || a.period - b.period);

  return { window, items };
}
