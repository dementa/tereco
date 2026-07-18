import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSheets,
  ensureSheet,
  appendRow,
} from "@/lib/googleSheets";
import {
  errorResponse,
  handleApiError,
  successResponse,
} from "@/lib/apiResponse";

// -------------------------------
// Validation Schema
// -------------------------------
const LessonSchema = z
  .object({
    school: z.string().min(1, "School is required"),
    class: z.string().min(1, "Class is required"),
    date: z.string().min(1, "Lesson date is required"),
    period: z.string().min(1, "Period is required"),
    status: z.string().min(1, "Lesson status is required"),

    missedReason: z.string().optional().default(""),
    explanation: z.string().optional().default(""),

    learningArea: z.string().min(1, "Learning area is required"),
    specificSkill: z.string().min(1, "Specific skill is required"),
    lessonApproach: z.string().min(1, "Lesson approach is required"),

    // Automatically convert "20" -> 20
    present: z.coerce.number().min(0, "Present learners cannot be negative"),
    absent: z.coerce.number().min(0, "Absent learners cannot be negative"),

    computerAccess: z.string().min(1, "Computer access is required"),
    overallProgress: z.string().min(1, "Overall progress is required"),
    achievement: z.string().min(1, "Achievement is required"),
    challenges: z.string().min(1, "Challenges are required"),
    supportRequired: z.string().optional().default(""),

    reference: z.string().optional(),
    teacher: z.string().optional(),
  })
  .passthrough();

export async function POST(request: NextRequest) {
  try {
    console.log("📥 Lesson submission received");

    // -------------------------------
    // Google Sheets Client
    // -------------------------------
    const { sheets, spreadsheetId } = getSheets();

    // -------------------------------
    // Parse Request
    // -------------------------------
    let body;

    try {
      body = await request.json();
      console.log("📦 Payload:", body);
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

    console.log("✅ Validation passed");

    // -------------------------------
    // Ensure Sheet Exists
    // -------------------------------
    await ensureSheet(
      sheets,
      spreadsheetId,
      "LessonRecords",
      [
        "School",
        "Class",
        "Date",
        "Period",
        "Status",
        "Missed Reason",
        "Explanation",
        "Learning Area",
        "Specific Skill",
        "Lesson Approach",
        "Present",
        "Absent",
        "Computer Access",
        "Overall Progress",
        "Achievement",
        "Challenges",
        "Support Required",
        "Reference",
        "Teacher",
        "Timestamp",
      ]
    );

    console.log("📄 LessonRecords sheet ready");

        // -------------------------------
    // Prepare Row
    // -------------------------------
    const row = [
      validated.school,
      validated.class,
      validated.date,
      validated.period,
      validated.status,
      validated.missedReason,
      validated.explanation,
      validated.learningArea,
      validated.specificSkill,
      validated.lessonApproach,
      validated.present,
      validated.absent,
      validated.computerAccess,
      validated.overallProgress,
      validated.achievement,
      validated.challenges,
      validated.supportRequired,
      validated.reference ?? "",
      validated.teacher ?? "",
      new Date().toISOString(),
    ];

    console.log("📝 Appending lesson record...");

    // -------------------------------
    // Save to Google Sheets
    // -------------------------------
    await appendRow(
      sheets,
      spreadsheetId,
      "LessonRecords",
      row
    );

    console.log("✅ Lesson successfully saved.");

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