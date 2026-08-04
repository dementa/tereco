import { NextRequest, NextResponse } from "next/server";
import { listMarkingReminders, type MarkingReminder } from "@/lib/assessments";
import { notify } from "@/lib/entities/notifications";
import { sendDigestEmail } from "@/lib/email";

/**
 * Vercel Cron hits this each morning (see vercel.json) to remind whoever owns
 * an assessment — its author, and any teacher added to it as a collaborator —
 * that scripts are sitting unmarked. Same auth posture as the lesson digest:
 * Vercel signs the request with `Authorization: Bearer $CRON_SECRET`, and this
 * route refuses anything else so it cannot be triggered by an outsider who
 * finds the URL.
 *
 * ─── Why this can run without anyone hearing from it ───────────────────────
 * MARKING_REMINDER_START (YYYY-MM-DD) is the first day reminders actually
 * reach people. Before that date — and whenever it is unset — the route still
 * does the full query and reports exactly who it *would* have contacted, but
 * writes no notification and sends no email.
 *
 * That exists because the reminder can be deployed and verified while staff
 * are still stood down, without a single teacher being pinged about a system
 * they have not been told is live yet. Unset means silent, deliberately: a
 * forgotten reminder is a nuisance, a reminder nobody was warned about is a
 * support call. Set it to the day teachers come back and it arms itself.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const reminders = await listMarkingReminders();
    const startsOn = process.env.MARKING_REMINDER_START ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const live = startsOn !== null && startsOn !== "" && today >= startsOn;

    if (!live) {
      // Names and counts only — enough to check the targeting is right
      // without putting staff addresses in a log.
      return NextResponse.json({
        success: true,
        suppressed: true,
        startsOn,
        today,
        wouldRemind: reminders.map((r) => ({
          name: r.name,
          scripts: r.totalScripts,
          assessments: r.assessments.length,
          emailable: r.email !== null,
        })),
      });
    }

    let notified = 0;
    let emailed = 0;

    for (const reminder of reminders) {
      const title = `${reminder.totalScripts} script${
        reminder.totalScripts === 1 ? "" : "s"
      } waiting to be marked`;
      const body = summarize(reminder);

      await notify({
        type: "marking_reminder",
        title,
        body,
        audience: { profileId: reminder.staffId },
        entityType: "assessments",
        // Their marking queue, not one assessment: most of these name more
        // than one paper, and the queue page already filters to what they can
        // mark.
        link: "/staff/marking",
      });
      notified += 1;

      // The bell badge is only seen next time they open the app; this is the
      // part that actually reaches them. Best-effort in the same way every
      // other email in this app is — a failed send must never be treated as
      // the reminder run itself failing.
      if (reminder.email) {
        const { sent } = await sendDigestEmail({
          to: reminder.email,
          subject: title,
          heading: title,
          body: `Hi ${reminder.name}, ${body} Sign in to TERECO to mark them.`,
        });
        if (sent) emailed += 1;
      }
    }

    return NextResponse.json({ success: true, reminders: reminders.length, notified, emailed });
  } catch (error) {
    console.error("Marking reminder cron error:", error);
    return NextResponse.json({ success: false, message: "Reminder failed" }, { status: 500 });
  }
}

/**
 * The papers themselves, so the reminder says what is outstanding rather than
 * just that something is. Capped at three: past that it stops being a nudge
 * and starts being a report, and the marking queue lists the rest.
 */
function summarize(reminder: MarkingReminder): string {
  const shown = reminder.assessments.slice(0, 3);
  const parts = shown.map(
    (a) =>
      `${a.title} (${a.systemId}) — ${a.pendingScripts} script${
        a.pendingScripts === 1 ? "" : "s"
      }${a.isAuthor ? "" : ", as collaborator"}`
  );
  const rest = reminder.assessments.length - shown.length;
  if (rest > 0) parts.push(`and ${rest} more`);
  return `${parts.join("; ")}.`;
}
