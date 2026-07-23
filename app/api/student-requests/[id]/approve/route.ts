import { NextRequest } from "next/server";
import { getCurrentProfile, requireSuperAdmin } from "@/lib/auth/session";
import { approveStudentRequest } from "@/lib/entities/student-requests";
import { notify } from "@/lib/entities/notifications";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const reviewer = await getCurrentProfile(request);
    if (!reviewer) return errorResponse("Unauthorized", 401);

    const { request: original, account } = await approveStudentRequest(id, reviewer.id);

    await notify({
      type: "account_created",
      title: "Your learner has been added",
      body: `Their account is ready — system ID ${account.systemId}.`,
      audience: { profileId: original.requestedBy },
      entityType: "student_requests",
      entityId: id,
      createdBy: reviewer.id,
    });

    return successResponse({ data: account });
  } catch (error) {
    return handleApiError(error, "Failed to approve student request");
  }
}
