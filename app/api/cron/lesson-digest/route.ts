import { NextRequest, NextResponse } from "next/server";
import { countUnreviewedForDate, listDigestRecipients } from "@/lib/lessons";
import { notify } from "@/lib/entities/notifications";
import { sendDigestEmail } from "@/lib/email";

/**
 * Vercel Cron hits this once a day (see vercel.json) to nudge admins about any
 * lesson report filed today that nobody has marked reviewed yet. Vercel signs
 * the request with `Authorization: Bearer $CRON_SECRET` when that project env
 * var is set — this route refuses anything else so it cannot be triggered by
 * an outsider who finds the URL.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const unreviewed = await countUnreviewedForDate(today);

    let emailed = 0;
    if (unreviewed > 0) {
      const title = `${unreviewed} lesson report${unreviewed === 1 ? "" : "s"} awaiting review`;
      const body = `Filed today and not yet marked reviewed.`;

      for (const role of ["admin", "super_admin"] as const) {
        await notify({
          type: "lesson_digest",
          title,
          body,
          audience: { role },
          entityType: "lesson_reports",
          link: "/admin/lessons",
        });
      }

      // The bell badge alone is easy to miss until the next time someone
      // opens the app — this is the actual "end of day" nudge, and it's
      // best-effort in the same way every other email in this app is: a
      // failed send must never be treated as the digest itself failing.
      const recipients = await listDigestRecipients();
      for (const recipient of recipients) {
        const { sent } = await sendDigestEmail({
          to: recipient.email,
          subject: title,
          heading: title,
          body: `Hi ${recipient.name}, ${body.toLowerCase()} Sign in to TERECO Collect to review them.`,
        });
        if (sent) emailed += 1;
      }
    }

    return NextResponse.json({ success: true, unreviewed, emailed });
  } catch (error) {
    console.error("Lesson digest cron error:", error);
    return NextResponse.json({ success: false, message: "Digest failed" }, { status: 500 });
  }
}
