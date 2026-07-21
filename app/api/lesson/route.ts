import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import {
  errorResponse,
  handleApiError,
  successResponse,
} from "@/lib/apiResponse";

/**
 * Field names match the payload sent by DailyLessonWizard.
 *
 * The wizard still sends display names (school / className / stream) for its
 * own review screen, but they are IGNORED here: a lesson report is filed
 * against schoolId/classId/streamId, which are now required. Accepting a
 * typed-in school name was how the old table ended up with records that no
 * longer join to anything.
 */
const LessonSchema = z
  .object({
    schoolId: z.string().uuid("A school must be selected"),
    classId: z.string().uuid("A class must be selected"),
    streamId: z.string().uuid().optional(),

    date: z.string().min(1, "Lesson date is required"),
    // The wizard sends 'Period 3'; the column is the number it always was.
    period: z.union([z.string(), z.number()]).transform((v, ctx) => {
      const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D+/g, ""), 10);
      if (!Number.isInteger(n) || n < 1 || n > 8) {
        ctx.addIssue({ code: "custom", message: "Period must be between 1 and 8" });
        return z.NEVER;
      }
      return n;
    }),

    status: z.enum(["Completed", "Partially Completed", "Missed"]),
    missedReason: z.string().optional().default(""),
    missedExplanation: z.string().optional().default(""),

    learningArea: z.string().min(1, "Learning area is required"),
    specificSkill: z.string().min(1, "Specific skill is required"),
    approach: z.string().min(1, "Lesson approach is required"),

    present: z.coerce.number().int().min(0, "Present learners cannot be negative"),
    absent: z.coerce.number().int().min(0, "Absent learners cannot be negative"),

    computerAccess: z.string().min(1, "Computer access is required"),
    overallProgress: z.string().min(1, "Overall progress is required"),
    achievement: z.string().optional().default(""),

    // Was 'Yes' | 'No'. A boolean cannot be spelled two ways.
    challenges: z
      .union([z.boolean(), z.enum(["Yes", "No"])])
      .transform((v) => v === true || v === "Yes"),
    challengeDetails: z.string().optional().default(""),
    supportRequired: z.string().optional().default(""),

    reference: z.string().optional(),
  })
  .strip();

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid request body.", 400);
    }

    const result = LessonSchema.safeParse(body);
    if (!result.success) {
      return handleApiError(result.error);
    }
    const validated = result.data;

    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const supabase = getSupabaseAdmin();

    // The academic year is derived from the lesson date, not supplied — a
    // report cannot be filed into a year it did not happen in. (The term is
    // resolved by a database trigger for the same reason.)
    const { data: year, error: yearError } = await supabase
      .from("academic_years")
      .select("id")
      .lte("starts_on", validated.date)
      .gte("ends_on", validated.date)
      .maybeSingle();

    if (yearError) throw new Error(yearError.message);
    if (!year) {
      return errorResponse(
        `No academic year covers ${validated.date}. Ask an administrator to set it up.`,
        400
      );
    }

    const { error } = await supabase.from("lesson_reports").insert({
      // Attribution comes from the verified session, never the request body.
      staff_id: profile.id,
      school_id: validated.schoolId,
      class_id: validated.classId,
      stream_id: validated.streamId ?? null,
      academic_year_id: year.id,

      lesson_date: validated.date,
      period: validated.period,
      status: validated.status,
      missed_reason: validated.missedReason,
      missed_explanation: validated.missedExplanation,

      learning_area: validated.learningArea,
      specific_skill: validated.specificSkill,
      approach: validated.approach,

      present: validated.present,
      absent: validated.absent,

      computer_access: validated.computerAccess,
      overall_progress: validated.overallProgress,
      achievement: validated.achievement,

      had_challenges: validated.challenges,
      challenge_details: validated.challengeDetails,
      support_required: validated.supportRequired,

      reference: validated.reference ?? "",
    });

    if (error) {
      // The one-report-per-slot unique index. A refresh or double-tap lands
      // here, and saying so is more useful than a generic failure.
      if (error.code === "23505") {
        return errorResponse(
          "A report for this class and period on this date has already been submitted.",
          409
        );
      }
      // Check-constraint and trigger violations are the database refusing an
      // internally inconsistent report (missed lesson with learners present,
      // a stream from another class, and so on).
      if (error.code === "23514" || error.code === "P0001") {
        return errorResponse(`This report is not consistent: ${error.message}`, 400);
      }
      console.error("Lesson insert error:", error);
      return errorResponse("Failed to save lesson record.", 500);
    }

    return successResponse({
      message: "Lesson submitted successfully.",
      reference: validated.reference,
    });
  } catch (error) {
    console.error("Lesson API Error:", error);
    return handleApiError(error);
  }
}
