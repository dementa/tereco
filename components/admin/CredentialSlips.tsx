'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { exportToCsv, exportToPdf } from '@/lib/tableExport';
import { AlertCircle, Download, FileText, Printer } from 'lucide-react';

export interface CredentialSlipEntry {
  name: string;
  systemId: string | null;
  temporaryPassword: string;
}

interface CredentialSlipsProps {
  /** Printed as the page heading, e.g. "P.4 Bright — login credentials". */
  title: string;
  entries: CredentialSlipEntry[];
  /** No extension — CSV and PDF each append their own. */
  fileBaseName: string;
}

const HEADERS = ['Name', 'System ID', 'Temporary password'];

/**
 * Name + System ID + password for a batch of accounts, ready to print as
 * slips or read out — the only distribution channel that works for
 * students too young to receive a credential over email.
 */
export function CredentialSlips({ title, entries, fileBaseName }: CredentialSlipsProps) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const rows = entries.map((e) => [e.name, e.systemId ?? '', e.temporaryPassword]);

  function downloadCsv() {
    exportToCsv(fileBaseName, HEADERS, rows);
  }

  async function downloadPdf() {
    setPdfError('');
    setExportingPdf(true);
    try {
      await exportToPdf(fileBaseName, title, HEADERS, rows);
    } catch {
      setPdfError('PDF export failed. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 print:hidden mb-2">
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1.5" aria-hidden /> Print credential slips
        </Button>
        <Button type="button" variant="outline" onClick={downloadCsv}>
          <Download className="w-4 h-4 mr-1.5" aria-hidden /> Download CSV
        </Button>
        <Button type="button" variant="outline" onClick={() => void downloadPdf()} isLoading={exportingPdf}>
          <FileText className="w-4 h-4 mr-1.5" aria-hidden /> Download PDF
        </Button>
      </div>
      {pdfError && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-[#C0392B] mb-2 print:hidden">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {pdfError}
        </p>
      )}

      {/* Printable slips — hidden on screen, shown only by the print stylesheet. */}
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
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
            className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-0.5 xs:gap-3 text-xs py-1.5 border-b border-primary-50 last:border-0"
          >
            <span className="truncate">{e.name}</span>
            {/* ID + password is ~25 monospace characters that `shrink-0` refused
                to yield, so on a phone it squeezed the name to nothing and could
                still overrun the row. Below `xs` it gets its own line. */}
            <span className="text-text-muted font-mono break-all xs:shrink-0">
              {e.systemId} · {e.temporaryPassword}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
