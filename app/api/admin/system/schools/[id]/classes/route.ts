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

const CreateSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  hasStreams: z.boolean().default(false),
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

    const schoolClass = await createClass({ schoolId: id, ...validated, createdBy: profile.id });
    return successResponse({ data: schoolClass });
  } catch (error) {
    return handleApiError(error, "Failed to create class");
  }
}
