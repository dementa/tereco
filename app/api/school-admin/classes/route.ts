import { NextRequest } from "next/server";
import { z } from "zod";
import { listClassesForSchool, createClass } from "@/lib/entities/classes";
import { getCurrentProfile, requireSchoolAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const classes = await listClassesForSchool(profile.schoolId);
    return successResponse({ data: classes });
  } catch (error) {
    return handleApiError(error, "Failed to list classes");
  }
}

const CreateSchema = z
  .object({
    level: z.number().int().min(1).max(7).nullable().optional(),
    alias: z.string().optional(),
    hasStreams: z.boolean().default(false),
  })
  .refine((v) => v.level != null || (v.alias ?? "").trim() !== "", {
    message: "Choose a grade level, or give the class a name",
  });

export async function POST(request: NextRequest) {
  const denied = await requireSchoolAdmin(request);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile?.schoolId) return errorResponse("No school on this account", 403);

    const validated = CreateSchema.parse(await request.json());
    const schoolClass = await createClass({
      schoolId: profile.schoolId,
      level: validated.level ?? null,
      alias: validated.alias ?? null,
      hasStreams: validated.hasStreams,
      createdBy: profile.id,
    });
    return successResponse({ data: schoolClass });
  } catch (error) {
    return handleApiError(error, "Failed to create class");
  }
}
