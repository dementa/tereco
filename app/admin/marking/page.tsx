'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { CheckSquare, Download } from 'lucide-react';

interface AssessmentOption {
  id: string;
  systemId: string;
  title: string;
  status: string;
}

interface Question {
  id: string;
  code: string;
  position: number;
  questionText: string;
  questionType: string;
  maxScore: number;
  correctAnswer?: string;
}

interface ResponseRecord {
  id: string;
  submissionId: string;
  studentName: string;
  school: string;
  className: string;
  questionId: string;
  questionCode: string;
  answer: string;
  score: number | null;
  maxScore: number;
  submittedAt: string;
}

export default function MarkingPage() {
  const toast = useToast();
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [selected, setSelected] = useState('');
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

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
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  const loadResponses = useCallback(
    async (systemId: string) => {
      if (!systemId) {
        setResponses([]);
        setQuestions([]);
        return;
      }
      setLoadingResponses(true);
      try {
        const res = await fetch(`/api/admin/responses?assessmentId=${encodeURIComponent(systemId)}`);
        const data = await res.json();
        if (data.success) {
          setResponses(data.data.responses);
          setQuestions(data.data.questions);
        } else {
          toast.error(data.message ?? 'Failed to load responses.');
        }
      } catch {
        toast.error('Network error loading responses.');
      } finally {
        setLoadingResponses(false);
      }
    },
    [toast]
  );

  async function saveScore(response: ResponseRecord, raw: string) {
    const score = Number(raw);
    if (Number.isNaN(score) || score < 0) {
      toast.error('Enter a score of 0 or more.');
      return;
    }
    // The database rejects anything above the question maximum; catching it
    // here means the marker gets told before a request is wasted.
    if (score > response.maxScore) {
      toast.error(`${response.questionCode} is out of ${response.maxScore}.`);
      return;
    }

    setSavingId(response.id);
    try {
      const res = await fetch(`/api/admin/responses/${response.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      const data = await res.json();
      if (data.success) {
        setResponses((current) =>
          current.map((r) => (r.id === response.id ? { ...r, score } : r))
        );
      } else {
        toast.error(data.message ?? 'Could not save the score.');
      }
    } catch {
      toast.error('Network error saving the score.');
    } finally {
      setSavingId(null);
    }
  }

  const questionById = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions]
  );

  const columns: DataTableColumn<ResponseRecord>[] = useMemo(
    () => [
      { key: 'studentName', header: 'Student', value: (r) => r.studentName },
      { key: 'className', header: 'Class', value: (r) => r.className || '—' },
      { key: 'questionCode', header: 'Q', value: (r) => r.questionCode },
      {
        key: 'question',
        header: 'Question',
        sortable: false,
        value: (r) => questionById.get(r.questionId)?.questionText ?? '',
        render: (r) => (
          <span className="text-xs text-[#5A7D8A] line-clamp-2">
            {questionById.get(r.questionId)?.questionText ?? '—'}
          </span>
        ),
        hideOnMobile: true,
      },
      {
        key: 'answer',
        header: 'Answer',
        sortable: false,
        value: (r) => r.answer,
        render: (r) => (
          <span className="whitespace-pre-wrap break-words">{r.answer || '—'}</span>
        ),
      },
      {
        key: 'score',
        header: 'Score',
        align: 'right',
        value: (r) => r.score ?? -1,
        render: (r) => (
          <div className="flex items-center justify-end gap-1.5">
            <input
              type="number"
              min={0}
              max={r.maxScore}
              step="0.5"
              defaultValue={r.score ?? ''}
              disabled={savingId === r.id}
              aria-label={`Score for ${r.studentName}, ${r.questionCode}`}
              onBlur={(e) => {
                if (e.target.value === '' || Number(e.target.value) === r.score) return;
                void saveScore(r, e.target.value);
              }}
              className="w-16 rounded-lg border-2 border-[#D1E0E8] px-2 py-1 text-sm text-right focus:border-[#02465B] focus:outline-none disabled:opacity-50"
            />
            <span className="text-xs text-[#9BB3BD]">/ {r.maxScore}</span>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionById, savingId]
  );

  const unmarked = responses.filter((r) => r.score === null).length;

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Marking</h1>
        <p className="text-sm text-text-muted">
          Objective questions are scored automatically on submission. Written answers appear here
          for marking — totals update themselves as you go.
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
                void loadResponses(e.target.value);
              }}
            />
          </div>
          {selected && (
            <div className="flex items-center gap-3">
              <Badge variant={unmarked === 0 ? 'success' : 'accent'}>
                {unmarked === 0 ? 'Fully marked' : `${unmarked} awaiting marking`}
              </Badge>
              <a href={`/api/admin/assessments/${selected}/results/pdf`} download>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-1.5" aria-hidden />
                  Results PDF
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
      ) : (
        <DataTable
          rows={responses}
          columns={columns}
          rowKey={(r) => r.id}
          loading={loadingResponses}
          initialSort={{ key: 'studentName', direction: 'asc' }}
          searchPlaceholder="Search by student, class, question or answer…"
          emptyMessage="No responses recorded for this assessment yet."
          pageSize={50}
          mobileTitle={(r) => `${r.studentName} · ${r.questionCode}`}
          filters={[
            {
              key: 'marking',
              label: 'Marking',
              options: [
                { value: 'pending', label: 'Awaiting marking' },
                { value: 'marked', label: 'Marked' },
              ],
              matches: (r, v) => (v === 'pending' ? r.score === null : r.score !== null),
            },
            {
              key: 'question',
              label: 'Question',
              options: questions
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((q) => ({ value: q.code, label: q.code })),
              matches: (r, v) => r.questionCode === v,
            },
          ]}
        />
      )}
    </div>
  );
}
