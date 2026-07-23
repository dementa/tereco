'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { ArrowLeft, Check, CheckSquare, Download, FileText, Minus, Plus, X } from 'lucide-react';

interface AssessmentOption {
  id: string;
  systemId: string;
  title: string;
  status: string;
}

interface Result {
  submissionId: string;
  studentId: string;
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

type Verdict = 'correct' | 'partial' | 'wrong' | 'unmarked';

interface MarkedAnswer {
  questionId: string;
  position: number;
  code: string;
  questionText: string;
  questionType: string;
  options: string[];
  imageUrl?: string;
  givenAnswer: string;
  correctAnswer?: string;
  modelAnswer?: string;
  score: number | null;
  maxScore: number;
  verdict: Verdict;
}

interface Scan {
  id: string;
  pageNumber: number;
  url: string;
}

interface MarkedScript {
  mode?: 'online' | 'scanned';
  scans?: Scan[];
  assessmentSystemId: string;
  assessmentTitle: string;
  studentName: string;
  studentSystemId: string | null;
  school: string;
  className: string;
  submittedAt: string;
  totalScore: number | null;
  maxScore: number;
  percentage: number | null;
  answers: MarkedAnswer[];
}

/** Responses carry no student id, so marking one needs its response row id. */
interface ResponseRef {
  id: string;
  questionId: string;
  submissionId: string;
}

const VERDICT_CLASS: Record<Verdict, string> = {
  correct: 'text-[#1F7A54]',
  partial: 'text-[#8A6A16]',
  wrong: 'text-[#A34C4C]',
  unmarked: 'text-[#9BB3BD]',
};

function formatAnswer(value: string, type: string): string {
  if (!value.trim()) return '';
  return type === 'checkbox'
    ? value.split('|').map((v) => v.trim()).filter(Boolean).join(', ')
    : value;
}

export default function MarkingPage() {
  const toast = useToast();
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [selected, setSelected] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);

  // The paper currently open for marking.
  const [openScript, setOpenScript] = useState<MarkedScript | null>(null);
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [responseRefs, setResponseRefs] = useState<ResponseRef[]>([]);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/assessments');
      const data = await res.json();
      if (data.success) setAssessments(data.data);
      else toast.error(data.message ?? 'Failed to load assessments.');
    } catch {
      toast.error('Network error while loading assessments.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const loadResults = useCallback(
    async (systemId: string) => {
      if (!systemId) {
        setResults([]);
        return;
      }
      setLoadingResults(true);
      try {
        const res = await fetch(`/api/admin/assessments/${systemId}/results`);
        const data = await res.json();
        if (data.success) setResults(data.data.results);
        else toast.error(data.message ?? 'Failed to load submissions.');
      } catch {
        toast.error('Network error loading submissions.');
      } finally {
        setLoadingResults(false);
      }
    },
    [toast]
  );

  /** Opens one learner's paper, with the response ids needed to score it. */
  const openPaper = useCallback(
    async (result: Result) => {
      setOpenScript(null);
      try {
        // Staff may read any learner's script through the same endpoint the
        // learner uses; the route enforces that only staff may pass studentId.
        const [scriptRes, responsesRes] = await Promise.all([
          fetch(`/api/assessments/${selected}/my-result?studentId=${result.studentId}`)
            .then((r) => r.json()),
          fetch(`/api/admin/responses?assessmentId=${encodeURIComponent(selected)}`).then((r) => r.json()),
        ]);
        if (!scriptRes.success) {
          toast.error(scriptRes.message ?? 'Could not open this paper.');
          return;
        }
        setOpenScript(scriptRes.data);
        setOpenStudentId(result.studentId);
        if (responsesRes.success) {
          setResponseRefs(
            (responsesRes.data.responses as { id: string; questionId: string; submissionId: string }[])
              .filter((r) => r.submissionId === result.submissionId)
              .map((r) => ({ id: r.id, questionId: r.questionId, submissionId: r.submissionId }))
          );
        }
      } catch {
        toast.error('Network error opening the paper.');
      }
    },
    [selected, toast]
  );

  async function saveScore(answer: MarkedAnswer, raw: string) {
    const score = Number(raw);
    if (Number.isNaN(score) || score < 0) {
      toast.error('Enter a score of 0 or more.');
      return;
    }
    // The database refuses anything above the question maximum; catching it
    // here means the marker is told before a request is wasted.
    if (score > answer.maxScore) {
      toast.error(`${answer.code} is out of ${answer.maxScore}.`);
      return;
    }
    const ref = responseRefs.find((r) => r.questionId === answer.questionId);
    if (!ref) {
      toast.error('That question has no recorded answer to mark.');
      return;
    }

    setSavingQuestionId(answer.questionId);
    try {
      const res = await fetch(`/api/admin/responses/${ref.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message ?? 'Could not save the score.');
        return;
      }
      // Update in place, then refresh the list so totals and marked-state stay
      // truthful without reopening the paper.
      setOpenScript((current) =>
        current
          ? {
              ...current,
              answers: current.answers.map((a) =>
                a.questionId === answer.questionId
                  ? {
                      ...a,
                      score,
                      verdict:
                        score >= a.maxScore ? 'correct' : score <= 0 ? 'wrong' : 'partial',
                    }
                  : a
              ),
            }
          : current
      );
      await loadResults(selected);
    } catch {
      toast.error('Network error saving the score.');
    } finally {
      setSavingQuestionId(null);
    }
  }

  /** Nudges a question's score by half a point, for fine-tuning partial credit. */
  function adjustScore(answer: MarkedAnswer, delta: number) {
    const current = answer.score ?? 0;
    const next = Math.min(answer.maxScore, Math.max(0, Math.round((current + delta) * 2) / 2));
    if (next !== current) void saveScore(answer, String(next));
  }

  const columns: DataTableColumn<Result>[] = useMemo(
    () => [
      {
        key: 'studentName',
        header: 'Student',
        value: (r) => r.studentName,
        render: (r) => (
          <span className="min-w-0">
            <span className="font-medium block truncate">{r.studentName}</span>
            <span className="text-xs text-text-muted">{r.studentSystemId ?? '—'}</span>
          </span>
        ),
      },
      { key: 'className', header: 'Class', value: (r) => r.className || '—' },
      {
        key: 'score',
        header: 'Score',
        align: 'right',
        value: (r) => r.totalScore ?? -1,
        render: (r) => (r.totalScore === null ? '—' : `${r.totalScore} / ${r.maxScore ?? '—'}`),
      },
      {
        key: 'percentage',
        header: '%',
        align: 'right',
        value: (r) => r.percentage ?? -1,
        render: (r) =>
          r.percentage === null ? (
            <Badge variant="accent">To mark</Badge>
          ) : (
            `${r.percentage}%`
          ),
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        align: 'right',
        render: (r) => (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => void openPaper(r)}
              title={`Mark ${r.studentName}'s paper`}
              className="inline-flex items-center gap-1 text-xs text-[#02465B] hover:underline"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden />
              Open
            </button>
          </div>
        ),
      },
    ],
    [openPaper]
  );

  const unmarked = results.filter((r) => r.percentage === null).length;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Marking</h1>
        <p className="text-sm text-text-muted">
          Objective questions are scored on submission. Open a learner&apos;s paper to mark their
          written answers — one paper at a time, the way a pile of scripts is actually marked.
        </p>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <Select
              label="Assessment"
              options={[
                { value: '', label: loading ? 'Loading…' : 'Select an assessment' },
                ...assessments.map((a) => ({
                  value: a.systemId,
                  label: `${a.systemId} — ${a.title}`,
                })),
              ]}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setOpenScript(null);
                void loadResults(e.target.value);
              }}
            />
          </div>
          {selected && results.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={unmarked === 0 ? 'success' : 'accent'}>
                {unmarked === 0 ? 'Fully marked' : `${unmarked} paper(s) to mark`}
              </Badge>
              <a href={`/api/admin/assessments/${selected}/scripts`} download>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-1.5" aria-hidden />
                  All scripts
                </Button>
              </a>
              <a href={`/api/admin/assessments/${selected}/results/pdf`} download>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-1.5" aria-hidden />
                  Results sheet
                </Button>
              </a>
            </div>
          )}
        </div>
      </Card>

      {!selected ? (
        <Card>
          <p className="text-sm text-text-muted flex items-center gap-2">
            <CheckSquare className="w-4 h-4" aria-hidden />
            Choose an assessment above to start marking.
          </p>
        </Card>
      ) : openScript ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <button
                type="button"
                onClick={() => setOpenScript(null)}
                className="inline-flex items-center gap-1.5 text-sm text-[#5A7D8A] hover:text-[#02465B] mb-2"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden />
                Back to the class
              </button>
              <h2 className="font-semibold text-primary-900">{openScript.studentName}</h2>
              <p className="text-xs text-text-muted">
                {openScript.studentSystemId}
                {openScript.className ? ` · ${openScript.className}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-primary-900">
                {openScript.totalScore ?? '—'} / {openScript.maxScore}
              </span>
              {openStudentId && (
                <a
                  href={`/api/assessments/${selected}/my-result/pdf?studentId=${openStudentId}`}
                  download
                >
                  <Button variant="outline">
                    <Download className="w-4 h-4 mr-1.5" aria-hidden />
                    Script
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* A paper sitting has no typed answers — without the pages there is
              literally nothing to mark from. */}
          {openScript.mode === 'scanned' && (
            <div className="mb-4">
              <p className="text-xs font-medium text-[#5A7D8A] mb-2">
                UPLOADED PAPER ({openScript.scans?.length ?? 0} page
                {openScript.scans?.length === 1 ? '' : 's'})
              </p>
              {openScript.scans?.length ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {openScript.scans.map((scan) => (
                    <a
                      key={scan.id}
                      href={scan.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-xl border border-[#E8EFF3] overflow-hidden hover:border-[#02465B]/40"
                      title={`Open page ${scan.pageNumber} full size`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={scan.url} alt={`Page ${scan.pageNumber}`} className="h-40 w-auto object-contain bg-[#F1F6F8]" />
                      <span className="block text-center text-xs text-[#5A7D8A] py-1">
                        Page {scan.pageNumber}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#C26565]">
                  This learner started a paper submission but uploaded no pages.
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {openScript.answers.map((a) => {
              const given = formatAnswer(a.givenAnswer, a.questionType);
              return (
                <div key={a.questionId} className="rounded-xl border border-[#E8EFF3] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-[#12333F] flex-1">
                      {a.position}. {a.questionText}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-[#9BB3BD] mr-0.5">
                        {a.maxScore} pt{a.maxScore === 1 ? '' : 's'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void saveScore(a, String(a.maxScore))}
                        disabled={savingQuestionId === a.questionId}
                        aria-pressed={a.score === a.maxScore}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors disabled:opacity-50 ${
                          a.score === a.maxScore
                            ? 'bg-[#1F7A54] border-[#1F7A54] text-white'
                            : 'border-[#D1E0E8] text-[#5A7D8A] hover:border-[#1F7A54] hover:text-[#1F7A54]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden />
                        Correct
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const half = Math.round((a.maxScore / 2) * 2) / 2;
                          void saveScore(a, String(half));
                        }}
                        disabled={savingQuestionId === a.questionId}
                        aria-pressed={a.score !== null && a.score > 0 && a.score < a.maxScore}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors disabled:opacity-50 ${
                          a.score !== null && a.score > 0 && a.score < a.maxScore
                            ? 'bg-[#8A6A16] border-[#8A6A16] text-white'
                            : 'border-[#D1E0E8] text-[#5A7D8A] hover:border-[#8A6A16] hover:text-[#8A6A16]'
                        }`}
                      >
                        <Minus className="w-3.5 h-3.5" aria-hidden />
                        Partial
                      </button>
                      {a.score !== null && a.score > 0 && a.score < a.maxScore && (
                        <div className="flex items-center gap-1 rounded-lg border-2 border-[#D1E0E8] px-1">
                          <button
                            type="button"
                            onClick={() => adjustScore(a, -0.5)}
                            disabled={savingQuestionId === a.questionId}
                            aria-label={`Decrease score for ${a.code}`}
                            className="text-[#5A7D8A] hover:text-[#02465B] disabled:opacity-50"
                          >
                            <Minus className="w-3.5 h-3.5" aria-hidden />
                          </button>
                          <span className="text-xs font-medium text-[#12333F] w-6 text-center tabular-nums">
                            {a.score}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustScore(a, 0.5)}
                            disabled={savingQuestionId === a.questionId}
                            aria-label={`Increase score for ${a.code}`}
                            className="text-[#5A7D8A] hover:text-[#02465B] disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden />
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void saveScore(a, '0')}
                        disabled={savingQuestionId === a.questionId}
                        aria-pressed={a.score === 0}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors disabled:opacity-50 ${
                          a.score === 0
                            ? 'bg-[#A34C4C] border-[#A34C4C] text-white'
                            : 'border-[#D1E0E8] text-[#5A7D8A] hover:border-[#A34C4C] hover:text-[#A34C4C]'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" aria-hidden />
                        Wrong
                      </button>
                    </div>
                  </div>

                  {a.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.imageUrl}
                      alt=""
                      className="mt-2 max-h-28 rounded object-contain bg-[#F1F6F8]"
                    />
                  )}

                  <p className="text-[10px] text-[#5A7D8A] tracking-wide mt-2">ANSWER GIVEN</p>
                  {given ? (
                    <p className="text-sm text-[#12333F] whitespace-pre-wrap">{given}</p>
                  ) : (
                    <p className="text-sm text-[#9BB3BD] italic">No answer given</p>
                  )}

                  {a.correctAnswer && (
                    <>
                      <p className="text-[10px] text-[#5A7D8A] tracking-wide mt-2">CORRECT</p>
                      <p className="text-sm text-[#1F7A54]">
                        {formatAnswer(a.correctAnswer, a.questionType)}
                      </p>
                    </>
                  )}

                  {/* The author's guidance sits beside the box the marker types
                      into, which is the only place it is any use. */}
                  {a.modelAnswer && (
                    <>
                      <p className="text-[10px] text-[#5A7D8A] tracking-wide mt-2">
                        MARKING GUIDANCE
                      </p>
                      <p className="text-sm text-[#5A7D8A]">{a.modelAnswer}</p>
                    </>
                  )}

                  <p className={`text-xs font-medium mt-2 ${VERDICT_CLASS[a.verdict]}`}>
                    {a.verdict === 'unmarked' ? 'Not yet marked' : a.verdict}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <DataTable
          rows={results}
          columns={columns}
          rowKey={(r) => r.submissionId}
          loading={loadingResults}
          initialSort={{ key: 'studentName', direction: 'asc' }}
          searchPlaceholder="Search by student, ID or class…"
          emptyMessage="Nobody has sat this assessment yet."
          mobileTitle={(r) => r.studentName}
          onRowClick={(r) => void openPaper(r)}
          filters={[
            {
              key: 'marking',
              label: 'Marking',
              options: [
                { value: 'pending', label: 'To mark' },
                { value: 'marked', label: 'Marked' },
              ],
              matches: (r, v) =>
                v === 'pending' ? r.percentage === null : r.percentage !== null,
            },
          ]}
        />
      )}
    </div>
  );
}
