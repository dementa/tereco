import { NextRequest } from "next/server";
import { z } from "zod";
import { listNotifications, markAllRead, markRead } from "@/lib/entities/notifications";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";

/** Everyone signed in has notifications; the audience rules decide what they see. */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse("Unauthorized", 401);
  try {
    const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";
    const notifications = await listNotifications(profile.id, { unreadOnly, limit: 100 });
    return successResponse({
      data: notifications,
      unread: notifications.filter((n) => !n.isRead).length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load notifications");
  }
}

const ReadSchema = z.object({
  ids: z.array(z.number().int()).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile(request);
  if (!profile) return errorResponse("Unauthorized", 401);
  try {
    const { ids, all } = ReadSchema.parse(await request.json());
    // Read state is per person and always the caller's own — the id never
    // comes from the request body.
    if (all) await markAllRead(profile.id);
    else if (ids?.length) await markRead(profile.id, ids);
    return successResponse({ message: "Marked as read" });
  } catch (error) {
    return handleApiError(error, "Failed to update notifications");
  }
}
