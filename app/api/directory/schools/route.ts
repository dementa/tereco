import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { listSchoolsDirectory } from "@/lib/entities/classes";
import { errorResponse, successResponse } from "@/lib/apiResponse";

/**
 * Read-only schools -> classes -> streams directory for anyone who legitimately
 * fills out forms referencing them (the lesson wizard). Broader than
 * /api/admin/system/schools, which is super-admin-only configuration surface.
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["super_admin", "admin", "staff"]);
  if (denied) return denied;
  try {
    const directory = await listSchoolsDirectory();
    return successResponse({ data: directory });
  } catch (error) {
    console.error("Error listing schools directory:", error);
    return errorResponse("Failed to list schools", 500);
  }
}
