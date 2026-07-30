import { NextRequest } from "next/server";
import { z } from "zod";
import { createTerm, listTermsForSchool } from "@/lib/entities/terms";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const academicYearId = searchParams.get("academicYearId") ?? undefined;
    const terms = await listTermsForSchool(id, academicYearId);
    return successResponse({ data: terms });
  } catch (error) {
    return handleApiError(error, "Failed to list terms");
  }
}

const CreateSchema = z.object({
  academicYearId: z.string().min(1, "An academic year is required"),
  number: z.number().int().min(1).max(3),
  name: z.string().optional().default(""),
  startsOn: z.string().min(1, "A start date is required"),
  endsOn: z.string().min(1, "An end date is required"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const validated = CreateSchema.parse(await request.json());
    const term = await createTerm({ schoolId: id, ...validated });
    return successResponse({ data: term });
  } catch (error) {
    return handleApiError(error, "Failed to create term");
  }
}
