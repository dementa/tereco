import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { getCompetencyMarksheet } from "@/lib/entities/competency-exams";
import { listClassesForSchool, listSchoolsDirectory } from "@/lib/entities/classes";
import { listTermsForSchool } from "@/lib/entities/terms";

/**
 * GET /api/competency-marksheet — one class's competency marks for one term.
 *
 * Teachers and school admins always get their own school. TERECO admins
 * (admin, super_admin) pass ?schoolId= to choose one.
 *
 *   ?options=1                     → the pickers: { schools?, terms, classes }
 *   ?termId=&classId=[&streamId=]  → the marksheet itself
 *
 * The options mode exists so every role's page fills its pickers from one
 * place, instead of each portal stitching together its own terms/classes
 * routes with different role gates.
 */
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["staff", "school_admin", "admin", "super_admin"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);
    const sp = request.nextUrl.searchParams;
    const isSystemAdmin = profile.role === "admin" || profile.role === "super_admin";

    // Never trust a schoolId from the query for school-scoped roles.
    const schoolId = isSystemAdmin ? sp.get("schoolId") : profile.schoolId;

    if (sp.get("options") === "1") {
      const schools = isSystemAdmin
        ? (await listSchoolsDirectory()).map((s) => ({ id: s.id, name: s.name }))
        : undefined;
      if (!schoolId) return successResponse({ data: { schools, terms: [], classes: [] } });
      const [terms, classes] = await Promise.all([listTermsForSchool(schoolId), listClassesForSchool(schoolId)]);
      return successResponse({
        data: {
          schools,
          terms,
          classes: classes
            .filter((c) => c.isActive)
            .map((c) => ({ id: c.id, displayName: c.displayName, streams: c.streams })),
        },
      });
    }

    if (!schoolId) return errorResponse(isSystemAdmin ? "Choose a school." : "No school on this account", isSystemAdmin ? 400 : 403);
    const termId = sp.get("termId");
    const classId = sp.get("classId");
    if (!termId || !classId) return errorResponse("Choose a term and a class.", 400);

    const data = await getCompetencyMarksheet(schoolId, termId, classId, sp.get("streamId"));
    if (!data) return errorResponse("That term or class was not found for this school.", 404);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Could not load the marksheet");
  }
}
