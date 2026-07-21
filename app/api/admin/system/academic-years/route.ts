import { NextRequest } from "next/server";
import { z } from "zod";
import { createAcademicYear, listAcademicYears } from "@/lib/entities/academic-years";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    return successResponse({ data: await listAcademicYears() });
  } catch (error) {
    return handleApiError(error, "Failed to list academic years");
  }
}

const CreateSchema = z.object({
  label: z.string().min(1, "A name is required (e.g. 2026)"),
  startsOn: z.string().min(1, "A start date is required"),
  endsOn: z.string().min(1, "An end date is required"),
  makeCurrent: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const validated = CreateSchema.parse(await request.json());
    return successResponse({ data: await createAcademicYear(validated) });
  } catch (error) {
    return handleApiError(error, "Failed to create academic year");
  }
}
