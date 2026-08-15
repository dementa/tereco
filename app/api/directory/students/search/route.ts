import { NextRequest } from "next/server";
import { searchCurrentEnrollments } from "@/lib/entities/enrollments";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * Find a currently-enrolled student by name or system ID, anywhere — for
 * picking individuals onto a list (e.g. entering marks) that a single
 * class/stream roster wouldn't naturally cover. Read-only, same role bar as
 * the class roster it complements.
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["super_admin", "admin", "staff"]);
  if (denied) return denied;
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    if (q.trim().length < 2) return successResponse({ data: [] });

    const results = await searchCurrentEnrollments(q);
    return successResponse({ data: results });
  } catch (error) {
    return handleApiError(error, "Failed to search students");
  }
}
