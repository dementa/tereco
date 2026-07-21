import { NextRequest } from "next/server";
import { z } from "zod";
import { listClassesForSchool, createClass } from "@/lib/entities/classes";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const classes = await listClassesForSchool(id);
    return successResponse({ data: classes });
  } catch (error) {
    console.error("Error listing classes:", error);
    return errorResponse("Failed to list classes", 500);
  }
}

// A class is either a rung on the canonical P.1-P.7 ladder or a school's own
// named class (ELITE). `alias` relabels a ladder class for schools that use
// their own naming; analysis still groups on `level`.
const CreateSchema = z
  .object({
    level: z.number().int().min(1).max(7).nullable().optional(),
    alias: z.string().optional(),
    hasStreams: z.boolean().default(false),
  })
  .refine((v) => v.level != null || (v.alias ?? "").trim() !== "", {
    message: "Choose a grade level, or give the class a name",
  });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = CreateSchema.parse(body);
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const schoolClass = await createClass({
      schoolId: id,
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
