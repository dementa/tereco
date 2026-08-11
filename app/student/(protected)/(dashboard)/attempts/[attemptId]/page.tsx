'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MarkingGuidance } from '@/components/MarkingGuidance';
import { AlertCircle, ArrowLeft, Check, HelpCircle, RotateCcw, X } from 'lucide-react';

interface Verdict {
  questionId: string;
  code: string;
  questionText: string;
  questionType: string;
  options: string[];
  imageUrl?: string;
  maxScore: number;
  answer: string;
  /** true = right, false = wrong, null = a person has to judge this one. */
  isCorrect: boolean | null;
  expected?: string;
  modelAnswer?: string;
}

interface AttemptResult {
  attemptId: string;
  assessmentId: string;
  assessmentTitle: string;
  systemId: string;
  startedAt: string;
  finishedAt: string | null;
  autoScore: number | null;
  autoMax: number | null;
  verdicts: Verdict[];
}

/** A checkbox answer is stored joined; show it as the learner picked it. */
function formatAnswer(answer: string, questionType: string): string {
  if (!answer.trim()) return '';
  if (questionType === 'checkbox') {
    return answer
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');
  }
  return answer;
}

/**
 * A finished practice attempt, marked.
 *
 * The one rule this screen exists to honour: `isCorrect === null` is NOT wrong.
 * Short and long answers cannot be machine-marked, and rendering them with a
 * red cross would tell a learner they failed every essay they wrote. They get a
 * neutral treatment and the model answer to compare against — which is the
 * thing the sponsor actually asked for.
 */
export default function PracticeAttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/e-papers/attempts/${params.attemptId}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok || !data.success) throw new Error(data.message || 'Could not load this attempt.');
        setResult(data.data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Could not load this attempt.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [params.attemptId]);

  if (loading) {
    return <p className="text-text-muted">Loading your answers...</p>;
  }

  if (error || !result) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <p className="text-error">{error || 'Attempt not found.'}</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push('/student/library')}>
          Back to Library
        </Button>
      </div>
    );
  }

  const marked = result.verdicts.filter((v) => v.isCorrect !== null);
  const forReview = result.verdicts.filter((v) => v.isCorrect === null);
  const rightCount = marked.filter((v) => v.isCorrect).length;

  return (
    <div className="w-full max-w-4xl">
      <Link
        href="/student/library"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Library
      </Link>

      <h1 className="text-2xl font-bold text-primary-900 mb-1">{result.assessmentTitle}</h1>
      <p className="text-sm text-text-muted mb-6">Practice attempt • nothing here counts towards your grade</p>

      {/*
        The score is stated as a fraction of what could be marked automatically,
        never of the whole paper. A paper with three multiple-choice and two
        essays reports "2 of 3" — reporting "2 of 5" would silently count both
        essays as zero and hand back a worse result than the learner earned.
      */}
      <Card className="p-5 mb-6">
        {result.autoMax !== null && result.autoMax > 0 ? (
          <>
            <p className="text-3xl font-bold text-primary-900 tabular-nums">
              {rightCount} <span className="text-lg font-medium text-text-muted">of {marked.length}</span>
            </p>
            <p className="text-sm text-text-muted mt-1">
              questions marked automatically
              {forReview.length > 0 && ` • ${forReview.length} for you to check yourself`}
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-primary-900">Written answers only</p>
            <p className="text-sm text-text-muted mt-1">
              Nothing on this paper can be marked automatically. Compare your answers with
              what was expected below.
            </p>
          </>
        )}

        <Button
          className="mt-4"
          variant="outline"
          inline
          onClick={() => router.push(`/student/practice/${result.systemId}`)}
        >
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Practise again
        </Button>
      </Card>

      <div className="space-y-3">
        {result.verdicts.map((v) => {
          const unmarkable = v.isCorrect === null;
          const answered = v.answer.trim() !== '';

          return (
            <Card key={v.questionId} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                {/*
                  Three states, three treatments. The neutral one is deliberately
                  not a muted cross or a greyed tick — either would still read as
                  a judgement, and no judgement has been made.
                */}
                <div
                  className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                    unmarkable
                      ? 'bg-bg-muted text-text-muted'
                      : v.isCorrect
                        ? 'bg-success-bg text-success'
                        : 'bg-error-bg text-error'
                  }`}
                >
                  {unmarkable ? (
                    <HelpCircle className="w-4 h-4" />
                  ) : v.isCorrect ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-primary-700 uppercase tracking-wider">
                    Question {v.code}
                    {v.maxScore ? ` • ${v.maxScore} mark${v.maxScore === 1 ? '' : 's'}` : ''}
                  </p>
                  <p className="text-base text-primary-900 mt-1">{v.questionText}</p>

                  {v.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.imageUrl}
                      alt=""
                      className="mt-3 max-h-56 max-w-full w-auto rounded-xl object-contain bg-[#FAFAFA]"
                    />
                  )}

                  <div className="mt-3 space-y-2.5">
                    <div>
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">
                        Your answer
                      </p>
                      {answered ? (
                        <p className="text-sm text-primary-900 whitespace-pre-wrap">
                          {formatAnswer(v.answer, v.questionType)}
                        </p>
                      ) : (
                        <p className="text-sm text-text-faint italic">You left this blank</p>
                      )}
                    </div>

                    {/*
                      The expected answer, which is the entire reason a learner
                      opens an E-Paper. Shown for every question — including the
                      ones they got right, because "I guessed and it was Kampala"
                      and "I knew it was Kampala" look identical from here.
                    */}
                    {v.expected && (
                      <div>
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">
                          Expected answer
                        </p>
                        <p className="text-sm text-primary-900 whitespace-pre-wrap">
                          {formatAnswer(v.expected, v.questionType)}
                        </p>
                      </div>
                    )}

                    {v.modelAnswer && (
                      <div>
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">
                          What was expected
                        </p>
                        <MarkingGuidance text={v.modelAnswer} />
                      </div>
                    )}

                    {unmarkable && !v.modelAnswer && !v.expected && (
                      <p className="text-sm text-text-muted italic">
                        Your teacher marks this kind of question by hand, and no model answer
                        was written for it.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
