import { NextRequest } from "next/server";
import { getSystemMarkingProgress } from "@/lib/assessments";
import { requireSuperAdmin } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/** System-wide totals for the admin assessments list page's marking-progress panel. */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const progress = await getSystemMarkingProgress();
    return successResponse({ data: progress });
  } catch (error) {
    return handleApiError(error, "Failed to load marking progress");
  }
}
