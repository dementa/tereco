'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/ui/ToastProvider';
import { ArrowLeft, Camera, Download, Loader2, Trash2 } from 'lucide-react';

interface Scan {
  id: string;
  pageNumber: number;
  url: string;
  uploadedAt: string;
}

interface Submission {
  submissionId: string;
  mode: 'online' | 'scanned';
  submittedAt: string;
  scans: Scan[];
}

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Sit a paper offline: download it, write on it, photograph every page and
 * upload them before the assessment closes.
 */
export default function PaperSubmissionPage() {
  const params = useParams<{ id: string }>();
  const systemId = params.id;
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [title, setTitle] = useState('');
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPage, setBusyPage] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${systemId}/scan`);
      const data = await res.json();
      if (data.success) {
        setSubmission(data.data.submission);
        setTitle(data.data.title);
        setClosesAt(data.data.closesAt);
      } else {
        setError(data.message ?? 'Could not load this paper.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [systemId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/assessment');
      return;
    }
    void (async () => {
      await load();
    })();
  }, [authLoading, isAuthenticated, router, load]);

  /** Next free page number, so pages arrive in order without being asked. */
  const nextPage = (submission?.scans.length ?? 0) + 1;

  async function uploadPage(file: File, pageNumber: number) {
    setError('');
    if (!ACCEPTED.includes(file.type)) {
      setError('Use a photo (JPEG, PNG or WebP) or a PDF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.`);
      return;
    }

    setBusyPage(pageNumber);
    try {
      // Starts the paper sitting on first use and returns a signature for
      // exactly this page.
      const startRes = await fetch(`/api/assessments/${systemId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageNumber }),
      });
      const started = await startRes.json();
      if (!started.success) throw new Error(started.message ?? 'Could not start your submission.');

      const { submissionId, upload } = started.data;
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', upload.apiKey);
      form.append('timestamp', String(upload.timestamp));
      form.append('signature', upload.signature);
      form.append('public_id', upload.publicId);
      form.append('overwrite', 'true');
      form.append('invalidate', 'true');

      const uploadRes = await fetch(upload.uploadUrl, { method: 'POST', body: form });
      if (!uploadRes.ok) {
        const detail = await uploadRes.json().catch(() => null);
        throw new Error(detail?.error?.message ?? 'The upload was rejected.');
      }

      const confirmRes = await fetch(`/api/assessments/${systemId}/scan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, pageNumber }),
      });
      const confirmed = await confirmRes.json();
      if (!confirmed.success) throw new Error(confirmed.message ?? 'Could not save the page.');

      toast.success(`Page ${pageNumber} uploaded.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusyPage(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removePage(pageNumber: number) {
    if (!submission) return;
    if (!confirm(`Remove page ${pageNumber}?`)) return;
    setBusyPage(pageNumber);
    try {
      const res = await fetch(`/api/assessments/${systemId}/scan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: submission.submissionId, pageNumber, remove: true }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? 'Could not remove the page.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the page.');
    } finally {
      setBusyPage(null);
    }
  }

  if (authLoading || loading) {
    return <div className="p-8 text-center text-[#5A7A85]">Loading…</div>;
  }

  const alreadyOnline = submission?.mode === 'online';

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => router.push('/assessment/list')}
        className="inline-flex items-center gap-1.5 text-sm text-[#5A7D8A] hover:text-[#02465B]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Back to assessments
      </button>

      <Card>
        <h1 className="text-xl font-bold text-primary-900">{title}</h1>
        <p className="text-sm text-text-muted mt-1">
          Answer this paper on paper, then photograph every page and upload them here.
        </p>
        {closesAt && (
          <p className="text-sm text-[#8A6A16] mt-2">
            Everything must be uploaded before {new Date(closesAt).toLocaleString()}.
          </p>
        )}

        <div className="mt-4">
          <a href={`/api/assessments/${systemId}/paper`} download>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-1.5" aria-hidden />
              Download the question paper
            </Button>
          </a>
        </div>
      </Card>

      {alreadyOnline ? (
        <Card>
          <p className="text-sm text-[#12333F]">
            You already answered this assessment on screen, so there is nothing to upload. Each
            assessment can only be sat once.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-primary-900">Your pages</h2>
            <Badge variant={submission?.scans.length ? 'success' : 'muted'}>
              {submission?.scans.length ?? 0} uploaded
            </Badge>
          </div>

          {submission?.scans.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {submission.scans.map((scan) => (
                <div key={scan.id} className="relative rounded-xl border border-[#E8EFF3] overflow-hidden">
                  {scan.url.endsWith('.pdf') ? (
                    <div className="h-28 flex items-center justify-center bg-[#F1F6F8] text-xs text-[#5A7D8A]">
                      PDF
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={scan.url} alt={`Page ${scan.pageNumber}`} className="h-28 w-full object-cover" />
                  )}
                  <div className="flex items-center justify-between px-2 py-1.5 bg-white">
                    <span className="text-xs text-[#12333F]">Page {scan.pageNumber}</span>
                    <button
                      type="button"
                      onClick={() => void removePage(scan.pageNumber)}
                      disabled={busyPage === scan.pageNumber}
                      aria-label={`Remove page ${scan.pageNumber}`}
                      className="text-[#C26565] hover:text-[#A34C4C] disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted mb-4">
              No pages yet. Photograph page 1 of your answer sheet to begin.
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            // Opens the camera directly on a phone, which is how most of these
            // will actually be captured.
            capture="environment"
            id="scan-input"
            className="sr-only"
            disabled={busyPage !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPage(file, nextPage);
            }}
          />
          <label
            htmlFor="scan-input"
            className={`inline-flex items-center gap-2 rounded-xl border-2 border-[#D1E0E8] bg-white px-4 py-2.5 text-sm font-medium text-[#02465B] ${
              busyPage !== null ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-[#02465B]/40'
            }`}
          >
            {busyPage !== null ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="w-4 h-4" aria-hidden />
            )}
            {busyPage !== null ? `Uploading page ${busyPage}…` : `Add page ${nextPage}`}
          </label>

          <p className="text-xs text-text-muted mt-3">
            Add one page at a time, in order. Check each photo is sharp and the whole page is
            visible — a page nobody can read cannot be marked. You can remove and retake any page
            until the assessment closes.
          </p>

          {error && (
            <p className="text-sm text-[#C26565] mt-3" role="alert">
              {error}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
