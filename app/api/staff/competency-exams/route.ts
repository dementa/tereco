import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { createCompetencyExam, listCompetencyExams } from "@/lib/entities/competency-exams";

/**
 * The teacher's Competency Examination list for their own school.
 *
 * GET  — this school's exams, newest first.
 * POST — start an exam for a named competency skill, with optional task
 *        instructions (or reopen the exam already checking that skill).
 *
 * Marks themselves go through /api/admin/assessments/[id]/enter-marks, the
 * same route the Behaviour Rating form uses: it already lets any teacher at
 * the exam's school record marks (canMarkAssessment).
 */

const CreateSchema = z.object({
  skill: z
    .string()
    .trim()
    .min(2, "Name the competency skill being checked.")
    .max(100, "Keep the skill name under 100 characters."),
  instructions: z.string().trim().max(2000, "Keep the task instructions under 2000 characters.").default(""),
});

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["staff"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);
    const data = await listCompetencyExams(profile.schoolId);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Could not load competency exams");
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["staff"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);
    const { skill, instructions } = CreateSchema.parse(await request.json());
    const data = await createCompetencyExam(profile.schoolId, skill, instructions, profile.id);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Could not start the exam");
  }
}
