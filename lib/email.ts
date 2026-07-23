import { Resend } from "resend";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrator",
  staff: "Staff",
  student: "Student",
  parent: "Parent",
};

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export interface CredentialsEmailInput {
  to: string;
  name: string;
  systemId: string | null; // null for super_admin — they sign in by email
  temporaryPassword: string;
  role: string;
}

/**
 * Best-effort credentials email. Returns whether it actually sent so callers
 * (the super-admin create-account screens) can fall back to showing the
 * password on-screen regardless of the outcome — RESEND_API_KEY/domain
 * verification may not be configured yet, and onboarding must not depend on
 * that being true.
 */
export async function sendCredentialsEmail(
  input: CredentialsEmailInput
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  const roleLabel = ROLE_LABELS[input.role] ?? input.role;
  const from = process.env.RESEND_FROM_EMAIL ?? "TERECO Collect <onboarding@resend.dev>";

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: "Your TERECO Collect account",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #02465B;">Welcome to TERECO Collect</h2>
          <p>Hi ${input.name},</p>
          <p>An account has been created for you as a <strong>${roleLabel}</strong>.</p>
          <table style="border-collapse: collapse; margin: 16px 0;">
            ${input.systemId ? `<tr><td style="padding: 4px 12px 4px 0; color: #5A7A85;">System ID</td><td style="font-family: monospace; font-weight: bold;">${input.systemId}</td></tr>` : ""}
            <tr><td style="padding: 4px 12px 4px 0; color: #5A7A85;">Temporary password</td><td style="font-family: monospace; font-weight: bold;">${input.temporaryPassword}</td></tr>
          </table>
          <p>Sign in with your ${input.systemId ? "System ID" : "email"} and this password. You'll be asked to set your own password on first login.</p>
          <p style="color: #9BBAC5; font-size: 12px;">If you didn't expect this account, contact your school administrator.</p>
        </div>
      `,
    });

    if (error) {
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export interface DigestEmailInput {
  to: string;
  subject: string;
  heading: string;
  body: string;
}

/**
 * A short best-effort notification email — same shape as the in-app
 * notification it accompanies, for someone who won't see the bell badge
 * until they next open the app. Never throws: a digest email failing must
 * never be treated as the digest itself failing.
 */
export async function sendDigestEmail(
  input: DigestEmailInput
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "RESEND_API_KEY is not configured" };

  const from = process.env.RESEND_FROM_EMAIL ?? "TERECO Collect <onboarding@resend.dev>";

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #02465B;">${input.heading}</h2>
          <p>${input.body}</p>
        </div>
      `,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export interface PdfEmailInput {
  to: string;
  subject: string;
  /** Body HTML. Keep it short — the PDF is the point. */
  html: string;
  filename: string;
  pdf: Buffer;
}

/**
 * Sends a PDF as an attachment.
 *
 * Attached rather than linked on purpose: a link to a child's results is a URL
 * that can be forwarded, indexed or guessed, whereas an attachment reaches
 * exactly the address it was sent to. It also means the recipient keeps the
 * document if the account is later closed.
 *
 * Returns whether it sent rather than throwing — an email failing must never
 * undo the thing that triggered it, such as results being released.
 */
export async function sendPdfEmail(
  input: PdfEmailInput
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "RESEND_API_KEY is not configured" };

  const from = process.env.RESEND_FROM_EMAIL ?? "TERECO <onboarding@resend.dev>";

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: [{ filename: input.filename, content: input.pdf }],
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
