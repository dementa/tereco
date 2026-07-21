'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { ArrowLeft, Download, KeyRound, Plus, Printer, Save, Send, Trash2 } from 'lucide-react';
import { QuestionImage } from '@/components/admin/QuestionImage';

type QuestionType =
  | 'mcq' | 'checkbox' | 'true_false' | 'fill' | 'matching' | 'dragdrop' | 'short' | 'long';

/** Types whose correct answer must be picked from the entered options. */
const CHOICE_TYPES: QuestionType[] = ['mcq', 'checkbox', 'true_false'];
/** Types the author supplies their own options for. */
const NEEDS_OPTIONS: QuestionType[] = ['mcq', 'checkbox'];
/** Types marked by a person, where a model answer is the useful thing. */
const HAND_MARKED: QuestionType[] = ['short', 'long', 'matching', 'dragdrop'];

const TRUE_FALSE_OPTIONS = ['True', 'False'];
const CHECKBOX_SEP = '|';

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mcq', label: 'Multiple choice (one answer)' },
  { value: 'checkbox', label: 'Multiple choice (several answers)' },
  { value: 'true_false', label: 'True or false' },
  { value: 'fill', label: 'Fill in the blank' },
  { value: 'short', label: 'Short answer (marked by hand)' },
  { value: 'long', label: 'Long answer (marked by hand)' },
];

interface Question {
  id?: string;
  position: number;
  code: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer?: string;
  modelAnswer?: string;
  imageUrl?: string;
  imagePublicId?: string;
  maxScore: number;
}

interface AssessmentTarget {
  id: string;
  schoolId: string | null;
  level: number | null;
  classId: string | null;
}

interface Assessment {
  id: string;
  systemId: string;
  title: string;
  description: string;
  timeLimit: number;
  opensAt?: string;
  closesAt?: string;
  status: 'draft' | 'published' | 'closed';
  instructions: string;
  targets: AssessmentTarget[];
  questions: Question[];
}

interface School {
  id: string;
  name: string;
}

interface GradeLevel {
  level: number;
  code: string;
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

function blankQuestion(position: number): Question {
  return {
    position,
    code: `Q${position}`,
    questionText: '',
    questionType: 'mcq',
    options: ['', ''],
    correctAnswer: '',
    maxScore: 1,
  };
}

export default function AssessmentDetailPage() {
  const params = useParams<{ id: string }>();
  const systemId = params.id;
  const router = useRouter();
  const toast = useToast();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [levels, setLevels] = useState<GradeLevel[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [release, setRelease] = useState<{ fullyMarked: boolean; releasedAt: string | null }>({
    fullyMarked: false,
    releasedAt: null,
  });
  const [releasing, setReleasing] = useState(false);
  const [emailOnRelease, setEmailOnRelease] = useState(true);
  const [instructions, setInstructions] = useState('');

  const load = useCallback(async () => {
    try {
      const [detail, schoolsRes, levelsRes, resultsRes, releaseRes] = await Promise.all([
        fetch(`/api/admin/assessments/${systemId}`).then((r) => r.json()),
        fetch('/api/admin/system/schools').then((r) => r.json()),
        fetch('/api/admin/system/grade-levels').then((r) => r.json()),
        fetch(`/api/admin/assessments/${systemId}/results`).then((r) => r.json()),
        fetch(`/api/admin/assessments/${systemId}/release`).then((r) => r.json()),
      ]);

      if (detail.success) {
        setAssessment(detail.data);
        setQuestions(detail.data.questions ?? []);
        setInstructions(detail.data.instructions ?? '');
      } else {
        toast.error(detail.message ?? 'Failed to load assessment.');
      }
      if (schoolsRes.success) setSchools(schoolsRes.data);
      if (levelsRes.success) setLevels(levelsRes.data);
      if (resultsRes.success) setResults(resultsRes.data.results);
      if (releaseRes.success) setRelease(releaseRes.data);
    } catch {
      toast.error('Network error while loading the assessment.');
    } finally {
      setLoading(false);
    }
  }, [systemId, toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  // Once anyone has sat the paper, the questions are frozen: rewriting them
  // under existing answers would invalidate every score already recorded.
  const locked = results.length > 0;

  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions((current) =>
      current.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );
  }

  function removeQuestion(index: number) {
    setQuestions((current) =>
      current
        .filter((_, i) => i !== index)
        .map((q, i) => ({ ...q, position: i + 1, code: `Q${i + 1}` }))
    );
  }

  async function saveQuestions() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/assessments/${systemId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questions.map((q) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: NEEDS_OPTIONS.includes(q.questionType)
              ? q.options.filter((o) => o.trim())
              : q.questionType === 'true_false'
                ? TRUE_FALSE_OPTIONS
                : [],
            correctAnswer: q.correctAnswer || undefined,
            modelAnswer: HAND_MARKED.includes(q.questionType)
              ? q.modelAnswer || undefined
              : undefined,
            imageUrl: q.imageUrl || undefined,
            imagePublicId: q.imagePublicId || undefined,
            maxScore: Number(q.maxScore),
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Questions saved.');
        await load();
      } else {
        toast.error(data.message ?? 'Failed to save questions.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function patchAssessment(patch: Record<string, unknown>, message: string) {
    const res = await fetch(`/api/admin/assessments/${systemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(message);
      await load();
    } else {
      toast.error(data.message ?? 'Update failed.');
    }
  }

  async function addTarget(target: { schoolId?: string; level?: number }) {
    if (!assessment) return;
    const next = [
      ...assessment.targets.map((t) => ({
        schoolId: t.schoolId,
        level: t.level,
        classId: t.classId,
      })),
      { schoolId: target.schoolId ?? null, level: target.level ?? null, classId: null },
    ];
    await patchAssessment({ targets: next }, 'Audience updated.');
  }

  async function removeTarget(targetId: string) {
    if (!assessment) return;
    const next = assessment.targets
      .filter((t) => t.id !== targetId)
      .map((t) => ({ schoolId: t.schoolId, level: t.level, classId: t.classId }));
    await patchAssessment({ targets: next }, 'Audience updated.');
  }

  async function removeAssessment() {
    if (
      !confirm(
        results.length > 0
          ? `Delete "${assessment?.title}"? ${results.length} learner(s) have sat it — their results will no longer be visible.`
          : `Delete "${assessment?.title}"?`
      )
    )
      return;
    const res = await fetch(`/api/admin/assessments/${systemId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      // Soft-deleted, so submissions and their scores survive the paper being
      // withdrawn — it simply stops appearing.
      toast.success('Assessment deleted.');
      router.push('/admin/assessments');
    } else {
      toast.error(data.message ?? 'Could not delete the assessment.');
    }
  }

  async function releaseResults() {
    setReleasing(true);
    try {
      const res = await fetch(`/api/admin/assessments/${systemId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailOnRelease }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        await load();
      } else {
        toast.error(data.message ?? 'Could not release results.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setReleasing(false);
    }
  }

  const resultColumns: DataTableColumn<Result>[] = useMemo(
    () => [
      { key: 'studentName', header: 'Student', value: (r) => r.studentName },
      { key: 'studentSystemId', header: 'Student ID', value: (r) => r.studentSystemId ?? '—' },
      { key: 'school', header: 'School', value: (r) => r.school || '—', hideOnMobile: true },
      { key: 'className', header: 'Class', value: (r) => r.className || '—' },
      {
        key: 'score',
        header: 'Score',
        align: 'right',
        value: (r) => r.totalScore ?? -1,
        render: (r) =>
          r.totalScore === null ? '—' : `${r.totalScore} / ${r.maxScore ?? '—'}`,
      },
      {
        key: 'percentage',
        header: '%',
        align: 'right',
        value: (r) => r.percentage ?? -1,
        // An unmarked paper says so rather than showing a misleading number.
        render: (r) =>
          r.percentage === null ? (
            <span className="text-[#9BB3BD]">pending</span>
          ) : (
            `${r.percentage}%`
          ),
      },
    ],
    []
  );

  if (loading) return <p className="text-text-muted">Loading…</p>;
  if (!assessment) return <p className="text-error">Assessment not found.</p>;

  const targetLabel = (t: AssessmentTarget) => {
    const parts = [
      t.schoolId ? (schools.find((s) => s.id === t.schoolId)?.name ?? 'Unknown school') : null,
      t.level !== null ? (levels.find((l) => l.level === t.level)?.code ?? `Level ${t.level}`) : null,
    ].filter(Boolean);
    return parts.join(' · ');
  };

  return (
    <div className="max-w-5xl space-y-4">
      <button
        type="button"
        onClick={() => router.push('/admin/assessments')}
        className="inline-flex items-center gap-1.5 text-sm text-[#5A7D8A] hover:text-[#02465B]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        All assessments
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
            {assessment.title}
            <Badge variant={assessment.status === 'published' ? 'success' : 'muted'}>
              {assessment.status}
            </Badge>
          </h1>
          <p className="text-sm text-text-muted">
            {assessment.systemId} · {assessment.timeLimit} minutes ·{' '}
            {questions.length} question{questions.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex gap-2">
          {assessment.status === 'draft' && (
            <Button
              onClick={() => void patchAssessment({ status: 'published' }, 'Assessment published.')}
              disabled={questions.length === 0}
              title={questions.length === 0 ? 'Add at least one question first' : undefined}
            >
              Publish
            </Button>
          )}
          {assessment.status === 'published' && (
            <Button
              variant="outline"
              onClick={() => void patchAssessment({ status: 'closed' }, 'Assessment closed.')}
            >
              Close
            </Button>
          )}
          <Button
            variant="outline"
            className="text-error border-error/20"
            onClick={() => void removeAssessment()}
          >
            <Trash2 className="w-4 h-4 mr-1.5" aria-hidden />
            Delete
          </Button>
        </div>
      </div>

      {/* ── Audience ─────────────────────────────────────────── */}
      <Card>
        <h2 className="font-semibold text-primary-900 mb-1">Audience</h2>
        <p className="text-xs text-text-muted mb-3">
          With no targets, every student may sit this. Add a target to narrow it by school or grade
          level — a student matching any target qualifies.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {assessment.targets.length === 0 ? (
            <Badge variant="accent">All students</Badge>
          ) : (
            assessment.targets.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-lg bg-[#F1F6F8] px-2 py-1 text-xs text-[#12333F]"
              >
                {targetLabel(t)}
                <button
                  type="button"
                  onClick={() => void removeTarget(t.id)}
                  aria-label={`Remove target ${targetLabel(t)}`}
                  className="text-[#5A7D8A] hover:text-[#C26565]"
                >
                  <Trash2 className="w-3 h-3" aria-hidden />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select
            label="Add: whole school"
            options={[
              { value: '', label: 'Select a school' },
              ...schools.map((s) => ({ value: s.id, label: s.name })),
            ]}
            value=""
            onChange={(e) => e.target.value && void addTarget({ schoolId: e.target.value })}
          />
          <Select
            label="Add: grade level (all schools)"
            options={[
              { value: '', label: 'Select a level' },
              ...levels.map((l) => ({ value: String(l.level), label: l.code })),
            ]}
            value=""
            onChange={(e) => e.target.value && void addTarget({ level: Number(e.target.value) })}
          />
        </div>
      </Card>

      {/* ── Paper ────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold text-primary-900">Printed paper</h2>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/assessments/${systemId}/paper`} download>
              <Button variant="outline">
                <Printer className="w-4 h-4 mr-1.5" aria-hidden />
                Question paper
              </Button>
            </a>
            {assessment.targets
              .filter((t) => t.schoolId)
              .map((t) => (
                <a
                  key={t.id}
                  href={`/api/admin/assessments/${systemId}/paper?schoolId=${t.schoolId}`}
                  download
                >
                  <Button variant="outline">
                    <Printer className="w-4 h-4 mr-1.5" aria-hidden />
                    {schools.find((s) => s.id === t.schoolId)?.name ?? 'School'} paper
                  </Button>
                </a>
              ))}
            <a href={`/api/admin/assessments/${systemId}/answer-key`} download>
              <Button
                variant="outline"
                disabled={assessment.status === 'published'}
                title={
                  assessment.status === 'published'
                    ? 'Unavailable while learners can still sit this paper'
                    : 'Correct answers and marking guidance'
                }
              >
                <KeyRound className="w-4 h-4 mr-1.5" aria-hidden />
                Answer key
              </Button>
            </a>
          </div>
        </div>
        <p className="text-xs text-text-muted mb-3">
          The plain paper carries TERECO branding; a per-school paper carries that school&apos;s
          logo. The answer key is unavailable while the assessment is published.
        </p>
        <label htmlFor="instructions" className="text-xs font-medium text-[#5A7D8A]">
          Instructions printed on the paper (leave blank for the standard wording)
        </label>
        <textarea
          id="instructions"
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="One instruction per line."
          className="mt-1.5 w-full rounded-xl border-2 border-[#D1E0E8] px-3 py-2 text-sm focus:border-[#02465B] focus:outline-none"
        />
        <div className="mt-2">
          <Button
            variant="outline"
            onClick={() => void patchAssessment({ instructions }, 'Instructions saved.')}
          >
            Save instructions
          </Button>
        </div>
      </Card>

      {/* ── Questions ────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-primary-900">Questions</h2>
          {!locked && (
            <Button variant="outline" onClick={() => setQuestions((q) => [...q, blankQuestion(q.length + 1)])}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden />
              Add question
            </Button>
          )}
        </div>

        {locked && (
          <p className="text-xs text-[#C26565] mb-3">
            {results.length} student{results.length === 1 ? ' has' : 's have'} already sat this
            paper, so the questions are locked — editing them would invalidate the scores already
            recorded against them.
          </p>
        )}

        <div className="space-y-3">
          {questions.length === 0 && (
            <p className="text-sm text-text-muted">No questions yet.</p>
          )}

          {questions.map((q, index) => (
            <div key={q.id ?? index} className="rounded-xl border border-[#E8EFF3] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#5A7D8A] w-8">{q.code}</span>
                <input
                  type="text"
                  value={q.questionText}
                  disabled={locked}
                  onChange={(e) => updateQuestion(index, { questionText: e.target.value })}
                  placeholder="Question text"
                  aria-label={`${q.code} text`}
                  className="flex-1 rounded-lg border-2 border-[#D1E0E8] px-3 py-1.5 text-sm disabled:bg-[#F8FBFC] focus:border-[#02465B] focus:outline-none"
                />
                {!locked && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(index)}
                    aria-label={`Remove ${q.code}`}
                    className="text-[#C26565] hover:text-[#A34C4C]"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Select
                  label="Type"
                  options={QUESTION_TYPES}
                  value={q.questionType}
                  disabled={locked}
                  onChange={(e) =>
                    updateQuestion(index, {
                      questionType: e.target.value as QuestionType,
                      options: NEEDS_OPTIONS.includes(e.target.value as QuestionType)
                        ? q.options.length
                          ? q.options
                          : ['', '']
                        : [],
                    })
                  }
                />
                <Input
                  label="Marks"
                  type="number"
                  min={1}
                  step="0.5"
                  value={q.maxScore}
                  disabled={locked}
                  onChange={(e) => updateQuestion(index, { maxScore: Number(e.target.value) })}
                />
                {/* Chosen from the options, never typed: a typo here scores
                    every learner zero on this question and nothing surfaces it
                    until someone reads the marks. The database rejects it too. */}
                {(q.questionType === 'mcq' || q.questionType === 'true_false') && (
                  <Select
                    label="Correct answer"
                    options={[
                      { value: '', label: 'Choose the correct option' },
                      ...(q.questionType === 'true_false' ? TRUE_FALSE_OPTIONS : q.options)
                        .filter((o) => o.trim())
                        .map((o) => ({ value: o, label: o })),
                    ]}
                    value={q.correctAnswer ?? ''}
                    disabled={locked}
                    onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })}
                  />
                )}
                {q.questionType === 'fill' && (
                  <Input
                    label="Correct answer"
                    value={q.correctAnswer ?? ''}
                    disabled={locked}
                    onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })}
                  />
                )}
              </div>

              {NEEDS_OPTIONS.includes(q.questionType) && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-[#5A7D8A]">
                    Choices
                    {q.questionType === 'checkbox' && ' — tick every correct one'}
                  </span>
                  {q.options.map((option, oi) => (
                    <div key={oi} className="flex gap-2 items-center">
                      {q.questionType === 'checkbox' && (
                        <input
                          type="checkbox"
                          disabled={locked || !option.trim()}
                          aria-label={`Mark choice ${oi + 1} correct`}
                          checked={(q.correctAnswer ?? '')
                            .split(CHECKBOX_SEP)
                            .map((a) => a.trim())
                            .includes(option.trim())}
                          onChange={(e) => {
                            const chosen = (q.correctAnswer ?? '')
                              .split(CHECKBOX_SEP)
                              .map((a) => a.trim())
                              .filter(Boolean);
                            const next = e.target.checked
                              ? [...chosen, option.trim()]
                              : chosen.filter((a) => a !== option.trim());
                            updateQuestion(index, { correctAnswer: next.join(CHECKBOX_SEP) });
                          }}
                          className="rounded border-[#D1E0E8] shrink-0"
                        />
                      )}
                      <input
                        type="text"
                        value={option}
                        disabled={locked}
                        onChange={(e) => {
                          const previous = q.options[oi];
                          const options = q.options.map((o, i) => (i === oi ? e.target.value : o));
                          // Carry the correct answer across the rename, or it
                          // silently stops matching any option.
                          let correctAnswer = q.correctAnswer;
                          if (q.questionType === 'checkbox') {
                            correctAnswer = (q.correctAnswer ?? '')
                              .split(CHECKBOX_SEP)
                              .map((a) => (a.trim() === previous.trim() ? e.target.value : a.trim()))
                              .filter(Boolean)
                              .join(CHECKBOX_SEP);
                          } else if (q.correctAnswer && q.correctAnswer === previous) {
                            correctAnswer = e.target.value;
                          }
                          updateQuestion(index, { options, correctAnswer });
                        }}
                        placeholder={`Choice ${oi + 1}`}
                        aria-label={`${q.code} choice ${oi + 1}`}
                        className="flex-1 rounded-lg border-2 border-[#D1E0E8] px-3 py-1.5 text-sm disabled:bg-[#F8FBFC] focus:border-[#02465B] focus:outline-none"
                      />
                      {!locked && q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion(index, {
                              options: q.options.filter((_, i) => i !== oi),
                            })
                          }
                          aria-label={`Remove choice ${oi + 1}`}
                          className="text-[#C26565]"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => updateQuestion(index, { options: [...q.options, ''] })}
                      className="text-xs text-[#02465B] hover:underline"
                    >
                      + Add choice
                    </button>
                  )}
                </div>
              )}

              {/* Without this the answer key is blank for exactly the questions
                  a human marker needs help with. Optional, so a paper can still
                  be written quickly. */}
              {HAND_MARKED.includes(q.questionType) && (
                <div className="space-y-1.5">
                  <label
                    htmlFor={`model-${index}`}
                    className="text-xs font-medium text-[#5A7D8A]"
                  >
                    Model answer / mark split (optional — printed on the answer key)
                  </label>
                  <textarea
                    id={`model-${index}`}
                    rows={2}
                    value={q.modelAnswer ?? ''}
                    disabled={locked}
                    onChange={(e) => updateQuestion(index, { modelAnswer: e.target.value })}
                    placeholder="e.g. Mouse (1 mark). Used to move the pointer or select items (1 mark)."
                    className="w-full rounded-lg border-2 border-[#D1E0E8] px-3 py-1.5 text-sm disabled:bg-[#F8FBFC] focus:border-[#02465B] focus:outline-none"
                  />
                </div>
              )}

              <QuestionImage
                assessmentId={assessment.id}
                position={q.position}
                value={q.imageUrl}
                disabled={locked}
                onChange={(url, publicId) =>
                  updateQuestion(index, { imageUrl: url ?? undefined, imagePublicId: publicId ?? undefined })
                }
              />
            </div>
          ))}
        </div>

        {!locked && questions.length > 0 && (
          <div className="mt-4">
            <Button onClick={() => void saveQuestions()} isLoading={saving}>
              <Save className="w-4 h-4 mr-1.5" aria-hidden />
              Save questions
            </Button>
          </div>
        )}
      </Card>

      {/* ── Results ──────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold text-primary-900">
            Results
            {release.releasedAt && (
              <Badge variant="success">
                Released {new Date(release.releasedAt).toLocaleDateString()}
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {results.length > 0 && !release.releasedAt && (
              <label className="flex items-center gap-1.5 text-xs text-[#5A7D8A] mr-1">
                <input
                  type="checkbox"
                  checked={emailOnRelease}
                  onChange={(e) => setEmailOnRelease(e.target.checked)}
                  className="rounded border-[#D1E0E8]"
                />
                Email scripts to learners and parents
              </label>
            )}
            {results.length > 0 && !release.releasedAt && (
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
            {results.length > 0 && (
              <a href={`/api/admin/assessments/${systemId}/results/pdf`} download>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-1.5" aria-hidden />
                  Download PDF
                </Button>
              </a>
            )}
          </div>
        </div>
        {results.length > 0 && !release.releasedAt && !release.fullyMarked && (
          <p className="text-xs text-[#C26565] mb-3">
            Results stay unreleased until every response has been marked — a learner opening a
            half-scored paper reads it as their final result.
          </p>
        )}

        <DataTable
          rows={results}
          columns={resultColumns}
          rowKey={(r) => r.submissionId}
          initialSort={{ key: 'studentName', direction: 'asc' }}
          searchPlaceholder="Search results by student, ID, school or class…"
          emptyMessage="Nobody has sat this assessment yet."
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
      </Card>
    </div>
  );
}
