'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { CheckSquare, Save } from 'lucide-react';

interface Assessment { id: string; title: string; }
interface Question { questionId: string; questionText: string; questionType: string; correctAnswer?: string; maxScore: number; }
interface ResponseRecord {
  id: string;
  studentName: string;
  className: string;
  school: string;
  questionId: string;
  answer: string;
  score: number | null;
  submittedAt: string;
}

interface StudentGroup {
  key: string;
  studentName: string;
  className: string;
  submittedAt: string;
  responses: ResponseRecord[];
}

export default function AdminMarkingPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selected, setSelected] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/assessments')
      .then((r) => r.json())
      .then((d) => { if (d.success) setAssessments(d.data); });
  }, []);

  const loadResponses = useCallback((assessmentId: string) => {
    if (!assessmentId) { setGroups([]); setQuestions([]); return; }
    setLoading(true);
    fetch(`/api/admin/responses?assessmentId=${encodeURIComponent(assessmentId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const qs: Question[] = d.data.questions ?? [];
        const responses: ResponseRecord[] = d.data.responses ?? [];
        setQuestions(qs);

        const map = new Map<string, StudentGroup>();
        for (const r of responses) {
          const key = `${r.studentName}__${r.className}__${r.submittedAt}`;
          if (!map.has(key)) {
            map.set(key, { key, studentName: r.studentName, className: r.className, submittedAt: r.submittedAt, responses: [] });
          }
          map.get(key)!.responses.push(r);
        }
        setGroups(Array.from(map.values()));

        const initial: Record<string, string> = {};
        for (const r of responses) initial[r.id] = r.score === null ? '' : String(r.score);
        setScores(initial);
      })
      .finally(() => setLoading(false));
  }, []);

  const questionById = (qid: string) => questions.find((q) => q.questionId === qid);

  const groupTotal = (g: StudentGroup) => {
    let earned = 0;
    let max = 0;
    for (const r of g.responses) {
      const q = questionById(r.questionId);
      max += q?.maxScore ?? 0;
      const v = scores[r.id];
      if (v !== '' && v !== undefined && !Number.isNaN(Number(v))) earned += Number(v);
    }
    return { earned, max };
  };

  const saveGroup = async (g: StudentGroup) => {
    setSavingKey(g.key);
    try {
      await Promise.all(
        g.responses.map((r) => {
          const v = scores[r.id];
          if (v === '' || v === undefined) return null;
          const num = Number(v);
          if (Number.isNaN(num)) return null;
          if (r.score !== null && r.score === num) return null;
          return fetch(`/api/admin/responses/${r.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: num }),
          });
        }).filter(Boolean) as Promise<Response>[]
      );
      loadResponses(selected);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Marking</h1>
      <p className="text-sm text-text-muted mb-6">Review student responses. Objective questions are auto-scored; edit any score and save.</p>

      <div className="max-w-sm mb-6">
        <Select
          label="Assessment"
          options={[{ value: '', label: 'Select an assessment…' }, ...assessments.map((a) => ({ value: a.id, label: a.title }))]}
          value={selected}
          onChange={(e) => { setSelected(e.target.value); loadResponses(e.target.value); }}
        />
      </div>

      {loading ? (
        <p className="text-text-muted">Loading responses…</p>
      ) : !selected ? null : groups.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckSquare className="w-10 h-10 text-text-faint mx-auto mb-3" />
          <p className="text-text-muted">No submissions for this assessment yet.</p>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const total = groupTotal(g);
            return (
              <Card key={g.key} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="font-semibold text-primary-900">{g.studentName}</p>
                    <p className="text-xs text-text-muted">{g.className} • {g.submittedAt ? new Date(g.submittedAt).toLocaleString() : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary-900">{total.earned} / {total.max}</p>
                    <p className="text-xs text-text-muted">total score</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {g.responses.map((r) => {
                    const q = questionById(r.questionId);
                    return (
                      <div key={r.id} className="border border-primary-100 rounded-xl p-3">
                        <p className="text-sm font-medium text-primary-900">{q?.questionText ?? r.questionId}</p>
                        <p className="text-sm text-text-secondary mt-1">
                          <span className="text-text-muted">Answer: </span>{r.answer || '—'}
                        </p>
                        {q?.correctAnswer && (
                          <p className="text-xs text-success mt-0.5">Correct: {q.correctAnswer}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <label className="text-xs text-text-muted">Score</label>
                          <input
                            type="number"
                            min={0}
                            max={q?.maxScore ?? undefined}
                            step="0.5"
                            value={scores[r.id] ?? ''}
                            onChange={(e) => setScores((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="w-20 rounded-lg border-2 border-[#D1E0E8] px-2 py-1 text-sm focus:border-primary-700 focus:outline-none"
                          />
                          <span className="text-xs text-text-muted">/ {q?.maxScore ?? 1}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <Button variant="primary" onClick={() => saveGroup(g)} isLoading={savingKey === g.key}>
                    <Save className="w-4 h-4 mr-1" /> Save marks
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
