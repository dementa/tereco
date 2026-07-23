import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireRole } from "@/lib/auth/session";
import { createStudentRequest, listStudentRequests } from "@/lib/entities/student-requests";
import { notify } from "@/lib/entities/notifications";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ["super_admin", "admin", "staff"]);
  if (denied) return denied;
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    // A teacher sees the requests they filed (any status); admins see every
    // pending one, since approving/rejecting is their job either way.
    const requests = await listStudentRequests(
      profile.role === "staff" ? { requestedBy: profile.id } : { status: "pending" }
    );
    return successResponse({ data: requests });
  } catch (error) {
    console.error("Error listing student requests:", error);
    return errorResponse("Failed to list student requests", 500);
  }
}

const CreateSchema = z.object({
  schoolId: z.string().uuid("A school is required"),
  classId: z.string().uuid("A class is required"),
  streamId: z.string().uuid().optional(),
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  gender: z.enum(["male", "female"]).optional(),
  dateOfBirth: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["super_admin", "admin", "staff"]);
  if (denied) return denied;
  try {
    const validated = CreateSchema.parse(await request.json());
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);

    const created = await createStudentRequest({ ...validated, requestedBy: profile.id });

    // Best-effort, same reasoning as every other notify() call in this app: a
    // notification failing must never lose the teacher's request.
    await notify({
      type: "new_student_request",
      title: `${profile.name} flagged a new learner`,
      body: `${created.firstName} ${created.lastName} — ${created.classDisplayName}${created.streamName ? ` ${created.streamName}` : ""}, ${created.schoolName}.`,
      audience: { role: "super_admin" },
      entityType: "student_requests",
      entityId: created.id,
      link: "/admin/system/students",
      createdBy: profile.id,
    });

    return successResponse({ data: created });
  } catch (error) {
    return handleApiError(error, "Failed to submit student request");
  }
}
