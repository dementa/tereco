'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import {
  ArrowLeft, Download, KeyRound, ListChecks, Printer, RotateCcw, Send, Trash2,
} from 'lucide-react';
import { PdfPreviewModal } from '@/components/assessment/PdfPreviewModal';
import { AssessmentSetupPanel } from '@/components/assessment/AssessmentSetupPanel';
import { SatVsMissedChart } from '@/components/assessment/charts/SatVsMissedChart';
import { QuestionPerformanceChart } from '@/components/assessment/charts/QuestionPerformanceChart';
import { ScoreDistributionChart } from '@/components/assessment/charts/ScoreDistributionChart';
import { PerformersChart } from '@/components/assessment/charts/PerformersChart';
import type { AssessmentAnalytics as AnalyticsData } from '@/lib/entities/assessment-analytics';

export type AssessmentRole = 'admin' | 'staff' | 'school_admin';

interface AssessmentTarget {
  id: string;
  schoolId: string | null;
  level: number | null;
  classId: string | null;
  studentId: string | null;
}

interface Capabilities {
  canManage: boolean;
  canMark: boolean;
  isOwner: boolean;
  canDownloadPaper: boolean;
  canDownloadResults: boolean;
  canDownloadAnswerKey: boolean;
}

interface HeaderAssessment {
  id: string;
  systemId: string;
  title: string;
  status: 'draft' | 'published' | 'closed';
  ePaperAt?: string;
  closesAt?: string;
  createdBy: string | null;
  targets: AssessmentTarget[];
  questions: unknown[];
  /** Set (instead of a full questions array) for roles that get a count but not question content, e.g. school_admin. */
  questionCount?: number;
  capabilities: Capabilities;
}

interface School {
  id: string;
  name: string;
}

interface Result {
  submissionId: string;
  studentName: string;
  studentSystemId: string | null;
  school: string;
  className: string;
  submittedAt: string;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  status: string;
}

interface AssessmentAnalyticsProps {
  systemId: string;
  role: AssessmentRole;
  /** e.g. '/api/admin/assessments' or '/api/school-admin/assessments'. */
  apiBase: string;
  /** Page the "Mark this paper" button navigates to, pre-selecting this assessment. Omit for read-only roles. */
  markingHref?: string;
}

/**
 * The analytics-first assessment detail page — replaces the old single
 * monolithic page. Every role reads the same shape from `apiBase`; what
 * differs is which capabilities the server hands back, which is what this
 * component gates its UI on rather than re-deriving access rules from
 * `role` itself.
 */
export function AssessmentAnalytics({ systemId, role, apiBase, markingHref }: AssessmentAnalyticsProps) {
  const router = useRouter();
  const toast = useToast();

  const [assessment, setAssessment] = useState<HeaderAssessment | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [release, setRelease] = useState<{ fullyMarked: boolean; releasedAt: string | null }>({
    fullyMarked: false,
    releasedAt: null,
  });
  const [emailOnRelease, setEmailOnRelease] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [tab, setTab] = useState<'analytics' | 'setup'>('analytics');
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ url: string; filename: string; title: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [publishAsEPaper, setPublishAsEPaper] = useState(false);
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenClosesAt, setReopenClosesAt] = useState('');

  const isSchoolAdmin = role === 'school_admin';

  const loadHeader = useCallback(async () => {
    const detail = await fetch(`${apiBase}/${systemId}`).then((r) => r.json());
    if (detail.success) {
      setAssessment(detail.data);
    } else {
      toast.error(detail.message ?? 'Failed to load assessment.');
    }
  }, [apiBase, systemId, toast]);

  const loadAnalytics = useCallback(async () => {
    const res = await fetch(`${apiBase}/${systemId}/analytics`).then((r) => r.json());
    if (res.success) setAnalytics(res.data);
  }, [apiBase, systemId]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        const tasks: Promise<unknown>[] = [loadHeader(), loadAnalytics()];
        if (!isSchoolAdmin) {
          tasks.push(
            fetch('/api/admin/system/schools').then((r) => r.json()).then((r) => {
              if (r.success) setSchools(r.data);
            }),
            fetch(`${apiBase}/${systemId}/results`).then((r) => r.json()).then((r) => {
              if (r.success) setResults(r.data.results);
            }),
            fetch(`${apiBase}/${systemId}/release`).then((r) => r.json()).then((r) => {
              if (r.success) setRelease(r.data);
            })
          );
        }
        if (!controller.signal.aborted) await Promise.all(tasks);
      } catch {
        toast.error('Network error while loading the assessment.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId, apiBase, isSchoolAdmin]);

  async function patchAssessment(patch: Record<string, unknown>, message: string) {
    const res = await fetch(`${apiBase}/${systemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(message);
      await loadHeader();
    } else {
      toast.error(data.message ?? 'Update failed.');
    }
  }

  async function reopenAssessment() {
    if (!assessment) return;
    const closingHasPassed = assessment.closesAt ? new Date(assessment.closesAt).getTime() < Date.now() : false;
    if (closingHasPassed && !showReopenForm) {
      setShowReopenForm(true);
      return;
    }
    if (showReopenForm) {
      if (!reopenClosesAt) return;
      await patchAssessment(
        { status: 'published', closesAt: new Date(reopenClosesAt).toISOString() },
        'Assessment reopened.'
      );
      setShowReopenForm(false);
      setReopenClosesAt('');
      return;
    }
    await patchAssessment({ status: 'published' }, 'Assessment reopened.');
  }

  async function removeAssessment() {
    if (!assessment) return;
    if (
      !confirm(
        results.length > 0
          ? `Delete "${assessment.title}"? ${results.length} learner(s) have sat it — their results will no longer be visible.`
          : `Delete "${assessment.title}"?`
      )
    )
      return;
    const res = await fetch(`${apiBase}/${systemId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast.success('Assessment deleted.');
      router.push(apiBase.includes('school-admin') ? '/school-admin/assessments' : role === 'staff' ? '/staff/assessments' : '/admin/assessments');
    } else {
      toast.error(data.message ?? 'Could not delete the assessment.');
    }
  }

  async function releaseResults() {
    setReleasing(true);
    try {
      const res = await fetch(`${apiBase}/${systemId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailOnRelease }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        const r = await fetch(`${apiBase}/${systemId}/release`).then((x) => x.json());
        if (r.success) setRelease(r.data);
      } else {
        toast.error(data.message ?? 'Could not release results.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setReleasing(false);
    }
  }

  async function allowResit(result: Result) {
    const scoreLabel = result.percentage !== null ? `, currently ${result.percentage}%` : '';
    if (
      !confirm(
        `Let ${result.studentName} resit this paper? This permanently deletes their current ` +
          `submission (${result.status}${scoreLabel}) so they can sit it again — this cannot be ` +
          `undone. The assessment must still be open for them to see it in their list.`
      )
    )
      return;
    const res = await fetch(`${apiBase}/${systemId}/results/${result.submissionId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setResults((prev) => prev.filter((r) => r.submissionId !== result.submissionId));
      toast.success(`${result.studentName} can resit this paper.`);
    } else {
      toast.error(data.message ?? 'Could not clear this submission.');
    }
  }

  const resultColumns: DataTableColumn<Result>[] = useMemo(
    () => [
      { key: 'studentName', header: 'Student', value: (r) => r.studentName },
      { key: 'studentSystemId', header: 'Student ID', value: (r) => r.studentSystemId ?? '—' },
      { key: 'school', header: 'School', value: (r) => r.school || '—', hideOnMobile: true },
      { key: 'className', header: 'Class', value: (r) => r.className || '—' },
      {
        key: 'percentage',
        header: 'Mark',
        align: 'right',
        value: (r) => r.percentage ?? -1,
        render: (r) =>
          r.percentage === null ? (
            <span className="text-[#A3A3A3]">pending</span>
          ) : (
            <div>
              <div className="font-semibold text-[#12333F]">{r.percentage}%</div>
              <div className="text-xs text-[#666666]">
                {r.totalScore} / {r.maxScore ?? '—'}
              </div>
            </div>
          ),
      },
    ],
    []
  );

  if (loading) return <p className="text-text-muted">Loading…</p>;
  if (!assessment) return <p className="text-error">Assessment not found.</p>;

  const cap = assessment.capabilities;
  const listHref = role === 'school_admin' ? '/school-admin/assessments' : role === 'staff' ? '/staff/assessments' : '/admin/assessments';
  const questionsHref = `${listHref}/${systemId}/questions`;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push(listHref)}
        className="inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#02465B]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        All assessments
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
            {assessment.title}
            <Badge variant={assessment.status === 'published' ? 'success' : 'muted'}>{assessment.status}</Badge>
            {assessment.ePaperAt && <Badge variant="success">E-Paper</Badge>}
          </h1>
          <p className="text-sm text-text-muted">
            {assessment.systemId} · {assessment.questionCount ?? assessment.questions.length} question
            {(assessment.questionCount ?? assessment.questions.length) === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {markingHref && cap.canMark && (
            <Button variant="outline" onClick={() => router.push(`${markingHref}?assessmentId=${systemId}`)}>
              <ListChecks className="w-4 h-4 mr-1.5" aria-hidden />
              Mark this paper
            </Button>
          )}
          {cap.canManage && (
            <Button variant="outline" onClick={() => router.push(questionsHref)}>
              Questions
            </Button>
          )}
          {cap.canManage && assessment.status === 'draft' && (
            <Button
              onClick={() => void patchAssessment({ status: 'published' }, 'Assessment published.')}
              disabled={assessment.questions.length === 0}
              title={assessment.questions.length === 0 ? 'Add at least one question first' : undefined}
            >
              Publish
            </Button>
          )}
          {cap.canManage && assessment.status === 'published' && (
            <Button variant="outline" onClick={() => { setPublishAsEPaper(false); setClosing(true); }}>
              Close
            </Button>
          )}
          {cap.canManage && assessment.status === 'closed' && showReopenForm && (
            <div className="flex items-end gap-2">
              <Input
                label="New closing time"
                type="datetime-local"
                value={reopenClosesAt}
                onChange={(e) => setReopenClosesAt(e.target.value)}
              />
              <Button onClick={() => void reopenAssessment()} disabled={!reopenClosesAt}>
                Reopen
              </Button>
              <Button variant="outline" onClick={() => { setShowReopenForm(false); setReopenClosesAt(''); }}>
                Cancel
              </Button>
            </div>
          )}
          {cap.canManage && assessment.status === 'closed' && !showReopenForm && (
            <Button
              variant="outline"
              onClick={() => void reopenAssessment()}
              title="Students who already submitted still can't resit it — only students who haven't sat this paper yet will regain access."
            >
              Reopen
            </Button>
          )}
          {cap.canManage && assessment.status === 'closed' && !showReopenForm && (
            <Button
              variant="outline"
              onClick={() =>
                void patchAssessment(
                  { isEPaper: !assessment.ePaperAt },
                  assessment.ePaperAt ? 'Withdrawn from the Library.' : 'Published as an E-Paper.'
                )
              }
              disabled={assessment.questions.length === 0}
              title={assessment.questions.length === 0 ? 'A paper with no questions cannot be practised' : undefined}
            >
              {assessment.ePaperAt ? 'Withdraw E-Paper' : 'Publish as E-Paper'}
            </Button>
          )}
          {cap.isOwner && (
            <Button variant="outline" className="text-error border-error/20" onClick={() => void removeAssessment()}>
              <Trash2 className="w-4 h-4 mr-1.5" aria-hidden />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* ── Downloads ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {cap.canDownloadPaper && (
          <Button
            variant="outline"
            onClick={() =>
              setPreview({
                url: `${apiBase}/${systemId}/paper`,
                filename: `${systemId}-paper.pdf`,
                title: 'Question paper',
              })
            }
          >
            <Printer className="w-4 h-4 mr-1.5" aria-hidden />
            Question paper
          </Button>
        )}
        {!isSchoolAdmin &&
          assessment.targets
            .filter((t) => t.schoolId)
            .map((t) => {
              const schoolName = schools.find((s) => s.id === t.schoolId)?.name ?? 'School';
              return (
                <Button
                  key={t.id}
                  variant="outline"
                  onClick={() =>
                    setPreview({
                      url: `${apiBase}/${systemId}/paper?schoolId=${t.schoolId}`,
                      filename: `${systemId}-${schoolName.replace(/[^a-zA-Z0-9]+/g, '-')}-paper.pdf`,
                      title: `${schoolName} paper`,
                    })
                  }
                >
                  <Printer className="w-4 h-4 mr-1.5" aria-hidden />
                  {schoolName} paper
                </Button>
              );
            })}
        {cap.canDownloadAnswerKey && (
          <Button
            variant="outline"
            disabled={assessment.status === 'published'}
            title={
              assessment.status === 'published'
                ? 'Unavailable while learners can still sit this paper'
                : 'Correct answers and marking guidance'
            }
            onClick={() =>
              setPreview({
                url: `${apiBase}/${systemId}/answer-key`,
                filename: `${systemId}-answer-key.pdf`,
                title: 'Answer key',
              })
            }
          >
            <KeyRound className="w-4 h-4 mr-1.5" aria-hidden />
            Answer key
          </Button>
        )}
        {cap.canDownloadResults && (
          <Button
            variant="outline"
            onClick={() =>
              setPreview({
                url: `${apiBase}/${systemId}/results/pdf`,
                filename: `${systemId}-results.pdf`,
                title: 'Results',
              })
            }
          >
            <Download className="w-4 h-4 mr-1.5" aria-hidden />
            Results
          </Button>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      {cap.canManage && (
        <div className="flex gap-1 border-b border-[#EAEAEA]">
          {(['analytics', 'setup'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                tab === t ? 'border-[#02465B] text-[#02465B]' : 'border-transparent text-[#666666] hover:text-[#02465B]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {tab === 'setup' && cap.canManage ? (
        <AssessmentSetupPanel systemId={systemId} apiBase={apiBase} onSaved={loadHeader} />
      ) : (
        <div className="space-y-4">
          {analytics && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Eligible', value: analytics.summary.eligibleCount },
                  { label: 'Sat', value: analytics.summary.satCount },
                  { label: 'Missed', value: analytics.summary.missedCount },
                  { label: 'Marked', value: analytics.summary.markedCount },
                  { label: 'Average', value: analytics.summary.averagePercent !== null ? `${analytics.summary.averagePercent}%` : '—' },
                  { label: 'Median', value: analytics.summary.medianPercent !== null ? `${analytics.summary.medianPercent}%` : '—' },
                  { label: 'Highest', value: analytics.summary.highestPercent !== null ? `${analytics.summary.highestPercent}%` : '—' },
                  { label: 'Lowest', value: analytics.summary.lowestPercent !== null ? `${analytics.summary.lowestPercent}%` : '—' },
                ].map((stat) => (
                  <Card key={stat.label} className="text-center">
                    <p className="text-xs text-text-muted">{stat.label}</p>
                    <p className="text-xl font-bold text-primary-900">{stat.value}</p>
                  </Card>
                ))}
              </div>

              <Card>
                <h2 className="font-semibold text-primary-900 mb-3">Who sat it</h2>
                <SatVsMissedChart
                  eligibleCount={analytics.summary.eligibleCount}
                  satCount={analytics.summary.satCount}
                  missedCount={analytics.summary.missedCount}
                />
              </Card>

              <Card>
                <h2 className="font-semibold text-primary-900 mb-3">Score distribution</h2>
                <ScoreDistributionChart
                  distribution={analytics.distribution}
                  topPerformers={analytics.topPerformers}
                  bottomPerformers={analytics.bottomPerformers}
                />
              </Card>

              <Card>
                <h2 className="font-semibold text-primary-900 mb-3">Top and bottom performers</h2>
                <PerformersChart topPerformers={analytics.topPerformers} bottomPerformers={analytics.bottomPerformers} />
              </Card>

              <Card>
                <h2 className="font-semibold text-primary-900 mb-3">Question performance</h2>
                <p className="text-xs text-text-muted mb-3">Sorted worst-done to best-done.</p>
                <QuestionPerformanceChart questions={analytics.questionStats} />
              </Card>
            </>
          )}

          {!isSchoolAdmin && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-semibold text-primary-900">
                  All submissions
                  {release.releasedAt && (
                    <Badge variant="success">Released {new Date(release.releasedAt).toLocaleDateString()}</Badge>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {cap.isOwner && results.length > 0 && !release.releasedAt && (
                    <label className="flex items-center gap-1.5 text-xs text-[#666666] mr-1">
                      <input
                        type="checkbox"
                        checked={emailOnRelease}
                        onChange={(e) => setEmailOnRelease(e.target.checked)}
                        className="rounded border-[#E5E5E5]"
                      />
                      Email scripts to learners and parents
                    </label>
                  )}
                  {cap.isOwner && results.length > 0 && !release.releasedAt && (
                    <Button
                      onClick={() => void releaseResults()}
                      isLoading={releasing}
                      disabled={!release.fullyMarked}
                      title={
                        release.fullyMarked
                          ? 'Notify every learner who sat this paper'
                          : 'Every response must be marked before results can be released'
                      }
                    >
                      <Send className="w-4 h-4 mr-1.5" aria-hidden />
                      Release results
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setShowSubmissions((v) => !v)}>
                    {showSubmissions ? 'Hide list' : 'View list'}
                  </Button>
                </div>
              </div>
              {results.length > 0 && !release.releasedAt && !release.fullyMarked && (
                <p className="text-xs text-[#C26565] mb-3">
                  Results stay unreleased until every response has been marked — a learner opening a
                  half-scored paper reads it as their final result.
                </p>
              )}
              {showSubmissions && (
                <DataTable
                  rows={results}
                  columns={resultColumns}
                  rowKey={(r) => r.submissionId}
                  rowActions={(r) => [
                    { label: 'Allow resit', icon: RotateCcw, onClick: () => void allowResit(r), danger: true },
                  ]}
                  initialSort={{ key: 'studentName', direction: 'asc' }}
                  searchPlaceholder="Search results by student, ID, school or class…"
                  emptyMessage="Nobody has sat this assessment yet."
                  exportFileName={`${systemId}-results`}
                  mobileTitle={(r) => r.studentName}
                  filters={[
                    {
                      key: 'marked',
                      label: 'Marking',
                      options: [
                        { value: 'marked', label: 'Fully marked' },
                        { value: 'pending', label: 'Awaiting marking' },
                      ],
                      matches: (r, v) => (v === 'marked' ? r.percentage !== null : r.percentage === null),
                    },
                  ]}
                />
              )}
            </Card>
          )}
        </div>
      )}

      <PdfPreviewModal
        open={preview !== null}
        onClose={() => setPreview(null)}
        url={preview?.url ?? null}
        filename={preview?.filename ?? 'document.pdf'}
        title={preview?.title ?? 'Preview'}
      />

      <Modal open={closing} onClose={() => setClosing(false)} title="Close this assessment">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Learners will no longer be able to sit <strong>{assessment.title}</strong>. Results and
            marking are unaffected, and you can reopen it afterwards.
          </p>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-bg-muted transition-colors">
            <input
              type="checkbox"
              checked={publishAsEPaper}
              onChange={(e) => setPublishAsEPaper(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-primary-700"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-primary-900">Also publish it as an E-Paper</span>
              <span className="block text-sm text-text-muted mt-0.5">
                The paper appears in the Library for the learners it was set for, to practise with no
                timer. Afterwards they see the model answers. Nothing they do counts towards their
                grades, and nobody is asked to mark any of it.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="outline" inline onClick={() => setClosing(false)}>
              Cancel
            </Button>
            <Button
              inline
              onClick={async () => {
                setClosing(false);
                await patchAssessment(
                  { status: 'closed', isEPaper: publishAsEPaper },
                  publishAsEPaper ? 'Assessment closed and published as an E-Paper.' : 'Assessment closed.'
                );
              }}
            >
              Close assessment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
