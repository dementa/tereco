import { NextRequest, NextResponse } from "next/server";
import {
  listPracticalReminders,
  type PracticalReminder,
} from "@/lib/entities/practical-observations";
import { notify } from "@/lib/entities/notifications";
import { sendDigestEmail } from "@/lib/email";

/**
 * Vercel Cron hits this each morning (see vercel.json) to remind a teacher about
 * lessons where they took the register but never finished scoring practical
 * skills. Same auth posture as the marking reminder and the lesson digest:
 * Vercel signs the request with `Authorization: Bearer $CRON_SECRET`, and this
 * route refuses anything else so it cannot be triggered by an outsider who finds
 * the URL.
 *
 * ─── Why an unfinished round needs chasing at all ──────────────────────────
 * Scoring is item-first, seven passes over the class, and it happens after the
 * lesson. A teacher interrupted on pass three leaves real work saved but not
 * counted — the completeness gate deliberately excludes partial rounds, because
 * a class scored on three aspects and a class scored on seven are not the same
 * measurement. Without a nudge, that work sits there and the learners simply
 * have no practical score, with nothing anywhere saying why.
 *
 * ─── Why this can run without anyone hearing from it ───────────────────────
 * PRACTICAL_REMINDER_START (YYYY-MM-DD) is the first day reminders actually
 * reach people; before that date — and whenever it is unset — the route does the
 * full query and reports exactly who it *would* have contacted, but writes no
 * notification and sends no email. Same reasoning as MARKING_REMINDER_START: a
 * forgotten reminder is a nuisance, a reminder nobody was warned about is a
 * support call. Unset means silent, deliberately.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const reminders = await listPracticalReminders();
    const startsOn = process.env.PRACTICAL_REMINDER_START ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const live = startsOn !== null && startsOn !== "" && today >= startsOn;

    if (!live) {
      // Names and counts only — enough to check the targeting is right without
      // putting staff addresses in a log.
      return NextResponse.json({
        success: true,
        suppressed: true,
        startsOn,
        today,
        wouldRemind: reminders.map((r) => ({
          name: r.name,
          rounds: r.rounds.length,
          emailable: r.email !== null,
        })),
      });
    }

    let notified = 0;
    let emailed = 0;

    for (const reminder of reminders) {
      const count = reminder.rounds.length;
      const title = `${count} lesson${count === 1 ? "" : "s"} still need practical scoring`;
      const body = summarize(reminder);

      await notify({
        type: "practical_reminder",
        title,
        body,
        audience: { profileId: reminder.staffId },
        entityType: "attendance_sessions",
        // Deep-linked when there is exactly one, because that is a single tap to
        // the work. With several, the lessons list is the honest destination —
        // picking one arbitrarily would hide the rest.
        link: count === 1 ? `/staff/practical/${reminder.rounds[0].sessionId}` : "/staff/lessons",
      });
      notified += 1;

      // The bell badge is only seen next time they open the app; this is the
      // part that actually reaches them. Best-effort in the same way every other
      // email in this app is — a failed send must never be treated as the
      // reminder run itself failing.
      if (reminder.email) {
        const { sent } = await sendDigestEmail({
          to: reminder.email,
          subject: title,
          heading: title,
          body: `Hi ${reminder.name}, ${body} Sign in to TERECO to finish scoring them.`,
        });
        if (sent) emailed += 1;
      }
    }

    // ─── The backlog, for super_admin only ──────────────────────────────
    // Deliberately narrower than the lesson digest, which goes to admin and
    // super_admin: approval-shaped powers here are super_admin only, the same
    // line canApproveLibraryContent draws in lib/auth/access.ts.
    //
    // One notification naming the teachers, not one per outstanding round. A
    // digest that lists 40 lessons is a report nobody reads; the point is to
    // show who has stopped scoring, so someone can ask them why.
    if (reminders.length > 0) {
      const totalRounds = reminders.reduce((sum, r) => sum + r.rounds.length, 0);
      await notify({
        type: "practical_reminder",
        title: `${totalRounds} lab lesson${totalRounds === 1 ? "" : "s"} not yet scored`,
        body: `${reminders.length} teacher${reminders.length === 1 ? "" : "s"} with practical scoring outstanding: ${reminders
          .map((r) => `${r.name} (${r.rounds.length})`)
          .join(", ")}.`,
        audience: { role: "super_admin" },
        entityType: "attendance_sessions",
        link: "/admin/lessons",
      });
    }

    return NextResponse.json({ success: true, reminders: reminders.length, notified, emailed });
  } catch (error) {
    console.error("Practical reminder cron error:", error);
    return NextResponse.json({ success: false, message: "Reminder failed" }, { status: 500 });
  }
}

/**
 * The lessons themselves, so the reminder says what is outstanding rather than
 * just that something is. Capped at three: past that it stops being a nudge and
 * starts being a report, and the lessons list has the rest.
 */
function summarize(reminder: PracticalReminder): string {
  const shown = reminder.rounds.slice(0, 3);
  const parts = shown.map(
    (r) =>
      `${r.sessionDate}, period ${r.period} — ${r.learners} learner${
        r.learners === 1 ? "" : "s"
      }`
  );
  const rest = reminder.rounds.length - shown.length;
  if (rest > 0) parts.push(`and ${rest} more`);
  return `${parts.join("; ")}.`;
}
