import { getSupabaseAdmin } from "@/lib/supabase";

export type NotificationType =
  | "lesson_filed"
  | "assessment_submitted"
  | "results_released"
  | "account_created"
  | "announcement";

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string | null;
  link: string | null;
  createdAt: string;
  isRead: boolean;
}

/**
 * Who should receive a notification.
 *
 * Leaving everything unset means everyone — that is a public announcement, and
 * it needs no sentinel value. Combining role and school narrows to both, e.g.
 * every staff member at one school.
 */
export interface Audience {
  role?: "super_admin" | "admin" | "staff" | "student" | "parent";
  schoolId?: string;
  profileId?: string;
}

export async function notify(input: {
  type: NotificationType;
  title: string;
  body?: string;
  audience?: Audience;
  entityType?: string;
  entityId?: string;
  link?: string;
  createdBy?: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("notifications").insert({
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    audience_role: input.audience?.role ?? null,
    audience_school_id: input.audience?.schoolId ?? null,
    audience_profile_id: input.audience?.profileId ?? null,
    entity_type: input.entityType ?? "",
    entity_id: input.entityId ?? null,
    link: input.link ?? null,
    created_by: input.createdBy ?? null,
  });

  // A failed notification must never break the action that triggered it: a
  // teacher's lesson report is the important thing, telling an admin about it
  // is not. Logged rather than thrown for that reason.
  if (error) console.error("Failed to create notification:", error.message);
}

/** Everything this person should see, newest first. */
export async function listNotifications(
  profileId: string,
  options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<Notification[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("notifications_for_profile", {
    p_profile: profileId,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type as NotificationType,
    title: n.title,
    body: n.body,
    entityType: n.entity_type,
    entityId: n.entity_id,
    link: n.link,
    createdAt: n.created_at,
    isRead: n.is_read,
  }));

  const filtered = options.unreadOnly ? rows.filter((n) => !n.isRead) : rows;
  return options.limit ? filtered.slice(0, options.limit) : filtered;
}

export async function unreadCount(profileId: string): Promise<number> {
  return (await listNotifications(profileId, { unreadOnly: true })).length;
}

/**
 * Marks notifications read for one person. Absence of a row means unread, so
 * this only ever inserts — and ignores conflicts, because reading something
 * twice is not an error.
 */
export async function markRead(profileId: string, notificationIds: number[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("notification_reads")
    .upsert(
      notificationIds.map((id) => ({ notification_id: id, profile_id: profileId })),
      { onConflict: "notification_id,profile_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

export async function markAllRead(profileId: string): Promise<void> {
  const unread = await listNotifications(profileId, { unreadOnly: true });
  await markRead(
    profileId,
    unread.map((n) => n.id)
  );
}
