'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { Download, Upload, ArrowLeft, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';

interface ParsedRow {
  row: number;
  data: { firstName: string; middleName?: string; lastName: string; class: string; stream?: string; dateOfBirth?: string; email?: string };
}
interface RowResult {
  row: number; name: string; status: 'created' | 'skipped' | 'error';
  systemId?: string; temporaryPassword?: string; note?: string; error?: string;
}

const CHUNK_SIZE = 40;

interface SchoolOption { id: string; name: string }

export default function StudentImportPage() {
  const toast = useToast();
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [allowCreateStructure, setAllowCreateStructure] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState(0);

  const loadSchools = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system/schools');
      const data = await res.json();
      if (data.success) setSchools(data.data);
    } catch {
      toast.error('Could not load schools.');
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadSchools();
    })();
    return () => controller.abort();
  }, [loadSchools]);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setParsedRows(null);
    setResults([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/system/students/import/parse', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setParsedRows(data.data);
        toast.success(`Found ${data.data.length} row(s). Review, then start the import.`);
      } else {
        toast.error(data.message || 'Failed to parse file.');
      }
    } catch {
      toast.error('Network error parsing the file.');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsedRows) return;
    setProcessing(true);
    setResults([]);
    setProgress(0);
    const allResults: RowResult[] = [];

    for (let i = 0; i < parsedRows.length; i += CHUNK_SIZE) {
      const chunk = parsedRows.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch('/api/admin/system/students/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk, schoolId, allowCreateStructure }),
        });
        const data = await res.json();
        if (data.success) {
          allResults.push(...data.data);
        } else {
          chunk.forEach((r) => allResults.push({ row: r.row, name: `${r.data.firstName ?? ''} ${r.data.lastName ?? ''}`.trim(), status: 'error', error: data.message || 'Chunk failed' }));
        }
      } catch {
        chunk.forEach((r) => allResults.push({ row: r.row, name: `${r.data.firstName ?? ''} ${r.data.lastName ?? ''}`.trim(), status: 'error', error: 'Network error' }));
      }
      setResults([...allResults]);
      setProgress(Math.min(i + CHUNK_SIZE, parsedRows.length));
    }

    setProcessing(false);
    const created = allResults.filter((r) => r.status === 'created').length;
    const skipped = allResults.filter((r) => r.status === 'skipped').length;
    const failed = allResults.filter((r) => r.status === 'error').length;
    toast[failed === 0 ? 'success' : 'warning'](`Import finished: ${created} created, ${skipped} already existed (skipped), ${failed} failed.`);
  };

  const downloadResultsCsv = () => {
    const header = 'row,name,status,system_id,temporary_password,note,error';
    const lines = results.map((r) => [
      r.row, `"${r.name.replace(/"/g, '""')}"`, r.status, r.systemId ?? '', r.temporaryPassword ?? '',
      `"${(r.note ?? '').replace(/"/g, '""')}"`, `"${(r.error ?? '').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-import-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createdCount = results.filter((r) => r.status === 'created').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return (
    <div className="max-w-4xl">
      <Link href="/admin/system/students" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Student Accounts
      </Link>
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Bulk Import Students</h1>
      <p className="text-sm text-text-muted mb-6">
        Choose the school, then upload its filled-in template. The file itself cannot name a
        school — that is what allowed a typo to silently create a duplicate one.
        Passwords are generated per student and only ever shown in the results below — download that file before leaving this page.
      </p>

      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-primary-900 mb-3">1. Choose the school</h2>
        <p className="text-sm text-text-muted mb-3">
          Every student in the file is enrolled at this school. Students cannot be imported into a
          school that does not exist yet — create it first.
        </p>
        <Select
          label="School"
          options={[
            { value: '', label: schools.length ? 'Select a school' : 'No schools yet — create one first' },
            ...schools.map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={schoolId}
          onChange={(e) => { setSchoolId(e.target.value); setResults([]); }}
        />
        <label className="flex items-start gap-2 text-sm text-[#12333F] mt-3">
          <input
            type="checkbox"
            checked={allowCreateStructure}
            onChange={(e) => setAllowCreateStructure(e.target.checked)}
            className="rounded border-[#D1E0E8] mt-0.5"
          />
          <span>
            Create missing classes and streams
            <span className="block text-xs text-text-muted">
              Off by default. Left off, an unknown class fails its own row and tells you what is
              missing. Turn it on only when onboarding a school&apos;s structure from its own list.
            </span>
          </span>
        </label>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-primary-900 mb-3">2. Get the template</h2>
        <p className="text-sm text-text-muted mb-3">Includes your current classes and streams on a Reference sheet so you can copy exact names.</p>
        <a href="/api/admin/system/students/import/template">
          <Button variant="outline"><Download className="w-4 h-4 mr-1.5" /> Download template</Button>
        </a>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-primary-900 mb-3">3. Upload the filled template</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setParsedRows(null); setResults([]); }}
            className="text-sm"
          />
          <Button onClick={handleParse} disabled={!file || !schoolId} isLoading={parsing}>
            <Upload className="w-4 h-4 mr-1.5" /> Parse file
          </Button>
        </div>
        {parsedRows && (
          <p className="text-sm text-success mt-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {parsedRows.length} row(s) ready to import.
          </p>
        )}
      </Card>

      {parsedRows && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-3">3. Import</h2>
          <Button onClick={handleImport} isLoading={processing} disabled={processing || !schoolId}>
            Create {parsedRows.length} student account(s)
          </Button>
          {processing && (
            <div className="mt-4">
              <div className="h-2 bg-bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary-700 transition-all" style={{ width: `${(progress / parsedRows.length) * 100}%` }} />
              </div>
              <p className="text-xs text-text-muted mt-1.5">{progress} / {parsedRows.length} processed</p>
            </div>
          )}
        </Card>
      )}

      {results.length > 0 && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-primary-900">
              Results — <Badge variant="success">{createdCount} created</Badge>{' '}
              {skippedCount > 0 && <Badge variant="muted">{skippedCount} already existed</Badge>}{' '}
              {errorCount > 0 && <Badge variant="muted" className="text-error">{errorCount} failed</Badge>}
            </h2>
            <Button variant="outline" onClick={downloadResultsCsv}>
              <Download className="w-4 h-4 mr-1.5" /> Download results (system IDs + passwords)
            </Button>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Safe to re-upload the same file — students that already exist (matched by name + class + stream) are skipped, not duplicated.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-1.5">
            {results.map((r) => (
              <div key={r.row} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-primary-50 last:border-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  {r.status === 'created' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : r.status === 'skipped' ? (
                    <MinusCircle className="w-3.5 h-3.5 text-text-faint shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-error shrink-0" />
                  )}
                  <span className="truncate">Row {r.row}: {r.name}</span>
                </span>
                <span className="text-text-muted truncate">
                  {r.status === 'created' ? r.systemId : r.status === 'skipped' ? r.note : r.error}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
