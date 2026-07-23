import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { rejectStudentRequest } from "@/lib/entities/student-requests";
import { notify } from "@/lib/entities/notifications";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

const RejectSchema = z.object({
  reason: z.string().min(1, "A rejection needs a reason"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { reason } = RejectSchema.parse(await request.json());
    const reviewer = await getCurrentProfile(request);
    if (!reviewer) return errorResponse("Unauthorized", 401);

    const { requestedBy } = await rejectStudentRequest(id, reviewer.id, reason);

    await notify({
      type: "announcement",
      title: "A student request was declined",
      body: reason,
      audience: { profileId: requestedBy },
      entityType: "student_requests",
      entityId: id,
      createdBy: reviewer.id,
    });

    return successResponse({ message: "Request rejected" });
  } catch (error) {
    return handleApiError(error, "Failed to reject student request");
  }
}
