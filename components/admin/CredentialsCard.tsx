'use client';

import { useState } from 'react';
import { Copy, Check, Mail, MailWarning, MailX } from 'lucide-react';

interface CredentialsCardProps {
  name: string;
  systemId: string;
  temporaryPassword: string;
  emailSent: boolean;
  emailError?: string;
  hasEmail?: boolean; // false ⇒ no email on file at all; Resend was never attempted
  onDismiss: () => void;
}

/**
 * Shown once right after an account is created. Always displays the
 * generated password on-screen regardless of whether the credentials email
 * actually sent — Resend may not be configured/domain-verified yet, and
 * onboarding must not depend on that.
 */
export function CredentialsCard({
  name, systemId, temporaryPassword, emailSent, emailError, hasEmail = true, onDismiss,
}: CredentialsCardProps) {
  const [copied, setCopied] = useState(false);

  const copyAll = () => {
    navigator.clipboard.writeText(`System ID: ${systemId}\nPassword: ${temporaryPassword}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border-2 border-primary-700/20 bg-primary-50 p-5 mb-6 print:border-black">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary-900">Account created for {name}</p>
          <p className="text-xs text-text-muted mt-0.5">Share these credentials — they won&apos;t be shown again.</p>
        </div>
        <button onClick={onDismiss} className="text-xs text-text-muted hover:text-primary-700 shrink-0">Dismiss</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 border border-primary-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-faint mb-1">System ID</p>
          <p className="font-mono font-semibold text-primary-900">{systemId}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-primary-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-faint mb-1">Temporary password</p>
          <p className="font-mono font-semibold text-primary-900">{temporaryPassword}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          {emailSent ? (
            <span className="flex items-center gap-1.5 text-success"><Mail className="w-3.5 h-3.5" /> Emailed to the account</span>
          ) : !hasEmail ? (
            <span className="flex items-center gap-1.5 text-text-muted">
              <MailX className="w-3.5 h-3.5" /> No email on file — share these credentials manually or print.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-text-muted" title={emailError}>
              <MailWarning className="w-3.5 h-3.5" /> Email not sent{emailError ? ` — ${emailError}` : ''}. Share manually or print.
            </span>
          )}
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:text-primary-800 px-3 py-1.5 rounded-lg border border-primary-200 bg-white"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs font-medium text-primary-700 hover:text-primary-800 px-3 py-1.5 rounded-lg border border-primary-200 bg-white"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
