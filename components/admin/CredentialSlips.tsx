'use client';

import { Button } from '@/components/ui/Button';
import { Download, Printer } from 'lucide-react';

export interface CredentialSlipEntry {
  name: string;
  systemId: string | null;
  temporaryPassword: string;
}

interface CredentialSlipsProps {
  /** Printed as the page heading, e.g. "P.4 Bright — login credentials". */
  title: string;
  entries: CredentialSlipEntry[];
  downloadFileName: string;
}

/**
 * Name + System ID + password for a batch of accounts, ready to print as
 * slips or read out — the only distribution channel that works for
 * students too young to receive a credential over email.
 */
export function CredentialSlips({ title, entries, downloadFileName }: CredentialSlipsProps) {
  function downloadCsv() {
    const header = 'name,system_id,temporary_password';
    const lines = entries.map((e) =>
      [`"${e.name.replace(/"/g, '""')}"`, e.systemId ?? '', e.temporaryPassword].join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex gap-2 print:hidden mb-4">
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1.5" aria-hidden /> Print credential slips
        </Button>
        <Button type="button" variant="outline" onClick={downloadCsv}>
          <Download className="w-4 h-4 mr-1.5" aria-hidden /> Download CSV
        </Button>
      </div>

      {/* Printable slips — hidden on screen, shown only by the print stylesheet. */}
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <div className="grid grid-cols-2 gap-3">
          {entries.map((e, i) => (
            <div key={i} className="border border-black rounded-lg p-3 break-inside-avoid">
              <p className="font-medium">{e.name}</p>
              <p className="text-sm">
                ID: <span className="font-mono">{e.systemId}</span>
              </p>
              <p className="text-sm">
                Password: <span className="font-mono">{e.temporaryPassword}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto space-y-1.5 print:hidden">
        {entries.map((e, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-primary-50 last:border-0"
          >
            <span className="truncate">{e.name}</span>
            <span className="text-text-muted font-mono shrink-0">
              {e.systemId} · {e.temporaryPassword}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
