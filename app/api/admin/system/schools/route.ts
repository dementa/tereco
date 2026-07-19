import { NextRequest } from "next/server";
import { z } from "zod";
import { listSchools, createSchool } from "@/lib/entities/schools";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const schools = await listSchools();
    return successResponse({ data: schools });
  } catch (error) {
    console.error("Error listing schools:", error);
    return errorResponse("Failed to list schools", 500);
  }
}

const CreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  contactEmail: z.string().email("Enter a valid contact email").optional().or(z.literal("")),
  contactPerson: z.string().optional(),
  contactNumber: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const validated = CreateSchema.parse(body);
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const school = await createSchool({ ...validated, createdBy: profile.id });
    return successResponse({ data: school });
  } catch (error) {
    return handleApiError(error, "Failed to create school");
  }
}
