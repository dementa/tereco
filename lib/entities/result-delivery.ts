import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendPdfEmail } from "@/lib/email";
import { getAllMarkedScripts, type MarkedScript } from "@/lib/assessments";
import { MarkedScriptDocument } from "@/lib/pdf/MarkedScriptDocument";

export interface DeliveryReport {
  attempted: number;
  sent: number;
  skipped: number;
  failures: { student: string; reason: string }[];
}

/**
 * Everyone who should receive a child's result: the learner if they have a real
 * email, plus every linked parent.
 *
 * Students often have a generated placeholder address rather than a real one —
 * those are Supabase Auth identifiers, never deliverable, so they are excluded
 * rather than bounced.
 */
async function recipientsFor(studentId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();

  const [{ data: student }, { data: links }] = await Promise.all([
    supabase.from("profiles").select("contact_email").eq("id", studentId).maybeSingle(),
    supabase
      .from("parent_students")
      .select("parent:profiles!parent_students_parent_id_fkey(contact_email)")
      .eq("student_id", studentId),
  ]);

  const emails = [
    student?.contact_email,
    ...((links ?? []) as unknown as { parent: { contact_email: string | null } | null }[]).map(
      (l) => l.parent?.contact_email
    ),
  ];

  return Array.from(
    new Set(emails.filter((e): e is string => !!e && e.includes("@")))
  );
}

function resultEmailBody(script: MarkedScript): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #02465B;">${script.assessmentTitle}</h2>
      <p>Results are now available for <strong>${script.studentName}</strong>${
        script.className ? ` (${script.className})` : ""
      }.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 4px 12px 4px 0; color: #5A7A85;">Score</td>
          <td style="font-weight: bold;">${script.totalScore ?? "—"} / ${script.maxScore}</td>
        </tr>
        <tr>
          <td style="padding: 4px 12px 4px 0; color: #5A7A85;">Percentage</td>
          <td style="font-weight: bold;">${script.percentage === null ? "—" : `${script.percentage}%`}</td>
        </tr>
      </table>
      <p>The attached PDF shows every question, the answer given, and the marks awarded.</p>
      <p style="color: #9BBAC5; font-size: 12px;">
        Sent by ${script.school || "TERECO"} through TERECO.
      </p>
    </div>
  `;
}

/**
 * Emails each learner's marked script to them and their parents.
 *
 * Sequential, and rendering one PDF at a time: a class of forty is forty PDF
 * renders and forty sends, and doing that concurrently is how you hit both the
 * mail provider's rate limit and the function's memory ceiling at once.
 *
 * Every failure is collected rather than thrown, because a single bad address
 * must not stop the rest of the class receiving theirs.
 */
export async function emailResultsForAssessment(assessmentId: string): Promise<DeliveryReport> {
  const scripts = await getAllMarkedScripts(assessmentId);
  const report: DeliveryReport = { attempted: 0, sent: 0, skipped: 0, failures: [] };

  for (const script of scripts) {
    const recipients = await recipientsFor(script.studentId);
    if (recipients.length === 0) {
      // No deliverable address is a normal state for a young learner, not a
      // failure worth reporting as one.
      report.skipped += 1;
      continue;
    }

    let pdf: Buffer;
    try {
      pdf = await renderToBuffer(MarkedScriptDocument({ script }));
    } catch (e) {
      report.failures.push({
        student: script.studentName,
        reason: e instanceof Error ? e.message : "Could not build the PDF",
      });
      continue;
    }

    for (const to of recipients) {
      report.attempted += 1;
      const result = await sendPdfEmail({
        to,
        subject: `${script.assessmentTitle} — results for ${script.studentName}`,
        html: resultEmailBody(script),
        filename: `${script.assessmentSystemId}-${script.studentName.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`,
        pdf,
      });
      if (result.sent) report.sent += 1;
      else report.failures.push({ student: script.studentName, reason: result.error ?? "Send failed" });
    }
  }

  return report;
}
