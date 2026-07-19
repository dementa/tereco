import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import {
  errorResponse,
  handleApiError,
  successResponse,
} from "@/lib/apiResponse";

// -------------------------------
// Validation Schema
// Field names match the payload sent by DailyLessonWizard.
// -------------------------------
const LessonSchema = z
  .object({
    school: z.string().min(1, "School is required"),
    className: z.string().min(1, "Class is required"),
    stream: z.string().optional(),
    date: z.string().min(1, "Lesson date is required"),
    period: z.string().min(1, "Period is required"),
    status: z.string().min(1, "Lesson status is required"),

    missedReason: z.string().optional().default(""),
    missedExplanation: z.string().optional().default(""),

    learningArea: z.string().min(1, "Learning area is required"),
    specificSkill: z.string().min(1, "Specific skill is required"),
    approach: z.string().min(1, "Lesson approach is required"),

    // Automatically convert "20" -> 20
    present: z.coerce.number().min(0, "Present learners cannot be negative"),
    absent: z.coerce.number().min(0, "Absent learners cannot be negative"),

    computerAccess: z.string().min(1, "Computer access is required"),
    overallProgress: z.string().min(1, "Overall progress is required"),
    achievement: z.string().min(1, "Achievement is required"),
    challenges: z.string().min(1, "Challenges are required"),
    challengeDetails: z.string().optional().default(""),
    supportRequired: z.string().optional().default(""),

    reference: z.string().optional(),
    teacher: z.string().optional(), // display-only now; teacher_id is sourced from the session, not trusted from this field

    schoolId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    streamId: z.string().uuid().optional(),
  })
  .strip();

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "admin", "super_admin"]);
  if (denied) return denied;

  try {
    // -------------------------------
    // Parse Request
    // -------------------------------
    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid request body.", 400);
    }

    // -------------------------------
    // Validate
    // -------------------------------
    const result = LessonSchema.safeParse(body);

    if (!result.success) {
      console.log("❌ Validation failed", result.error.issues);
      return handleApiError(result.error);
    }

    const validated = result.data;
    const profile = await getCurrentProfile(request);

    // -------------------------------
    // Save to Supabase
    // -------------------------------
    const supabase = getSupabaseAdmin();

    const record = {
      school: validated.school,
      class_name: validated.className,
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
      challenges: validated.challenges,
      challenge_details: validated.challengeDetails,
      support_required: validated.supportRequired,
      reference: validated.reference ?? "",
      teacher: profile?.name ?? validated.teacher ?? "",
      teacher_id: profile?.id ?? null,
      school_id: validated.schoolId ?? null,
      class_id: validated.classId ?? null,
      stream_id: validated.streamId ?? null,
    };

    const { error } = await supabase.from("lesson_records").insert(record);

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return errorResponse("Failed to save lesson record.", 500);
    }

    // -------------------------------
    // Success Response
    // -------------------------------
    return successResponse({
      message: "Lesson submitted successfully.",
      reference: validated.reference,
    });
  } catch (error) {
    console.error("❌ Lesson API Error:", error);
    return handleApiError(error);
  }
}
