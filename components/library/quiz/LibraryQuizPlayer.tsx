'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export interface PlayableQuiz {
  id: string;
  title: string;
  questions: { id: string; prompt: string; options: string[]; imageUrl: string | null }[];
}

interface Feedback {
  choice: number;
  correct: boolean;
  correctIndex: number;
  explanation: string | null;
}

const LETTERS = 'ABCDEF';

/**
 * Practice mode: one question at a time, the answer revealed as soon as the
 * learner commits to a choice, a score at the end. Nothing is recorded — the
 * quiz can be retaken freely. The correct answer only ever arrives from the
 * server after an answer is submitted, so it is not sitting in the page to be
 * read off before answering.
 */
export type CheckAnswer = (
  questionId: string,
  choice: number
) => Promise<{ correct: boolean; correctIndex: number; explanation: string | null }>;

/** Online: the server marks the answer, so the key never reaches the page before a choice is made. */
function checkOnline(quizId: string): CheckAnswer {
  return async (questionId, choice) => {
    const res = await fetch(`/api/library/quizzes/${quizId}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, choice }),
    }).then((r) => r.json());
    if (!res.success) throw new Error(res.message || 'Could not check that answer.');
    return res.data;
  };
}

/**
 * `check` is for TERECO Collect, which marks against its local copy of the
 * quiz with no network. Everywhere else it is left out and the server marks.
 */
export function LibraryQuizPlayer({ quiz, check }: { quiz: PlayableQuiz; check?: CheckAnswer }) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState(0);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const total = quiz.questions.length;
  const q = quiz.questions[index];
  const finished = index >= total;

  async function answer(choice: number) {
    if (feedback || checking) return;
    setChecking(true);
    setError('');
    try {
      const result = await (check ?? checkOnline(quiz.id))(q.id, choice);
      setFeedback({ choice, ...result });
      if (result.correct) setScore((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check that answer.');
    } finally {
      setChecking(false);
    }
  }

  function restart() {
    setIndex(0);
    setScore(0);
    setFeedback(null);
    setError('');
  }

  if (total === 0) return <p className="text-sm text-text-muted">This quiz has no questions yet.</p>;

  if (finished) {
    const pct = Math.round((score / total) * 100);
    return (
      <Card className="text-center space-y-3 py-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#0489AE]">Quiz complete</p>
        <p className="text-4xl font-bold text-[#011E28] tabular-nums">
          {score} / {total}
        </p>
        <p className="text-sm text-text-secondary">
          {pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Good effort — read the document again and have another go.' : 'Go back through the document, then try again.'}
        </p>
        <div className="pt-2">
          <Button inline onClick={restart}>Try again</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          Question {index + 1} of {total}
        </span>
        <span>Score {score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#02465B]/10" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={total}>
        <div className="h-full rounded-full bg-[#02465B] transition-all" style={{ width: `${((index + (feedback ? 1 : 0)) / total) * 100}%` }} />
      </div>

      <Card className="space-y-4">
        <p className="text-base font-medium text-[#011E28] whitespace-pre-line">{q.prompt}</p>
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt="" className="max-h-72 w-full object-contain rounded-lg bg-[#FAFAFA] border border-[#EAEAEA]" />
        )}

        <div className="space-y-2" role="group" aria-label="Answer options">
          {q.options.map((opt, oi) => {
            const isChosen = feedback?.choice === oi;
            const isRight = feedback?.correctIndex === oi;
            const state = !feedback
              ? 'border-[#02465B]/15 hover:border-[#02465B]/40 hover:bg-[#F5F5F5]'
              : isRight
              ? 'border-[#2E7D5B] bg-[#E7F5EE]'
              : isChosen
              ? 'border-[#C0392B] bg-[#FDECEA]'
              : 'border-[#02465B]/10 opacity-60';
            return (
              <button
                key={oi}
                type="button"
                disabled={!!feedback || checking}
                onClick={() => void answer(oi)}
                className={`w-full flex items-center gap-3 text-left rounded-xl border-2 px-3.5 py-3 text-sm text-[#011E28] transition-colors cursor-pointer disabled:cursor-default ${state}`}
              >
                <span className="shrink-0 w-6 h-6 rounded-full bg-[#02465B]/10 text-xs font-bold text-[#02465B] flex items-center justify-center">{LETTERS[oi]}</span>
                <span className="flex-1">{opt}</span>
                {feedback && isRight && <CheckCircle2 className="w-5 h-5 text-[#2E7D5B] shrink-0" aria-label="Correct answer" />}
                {feedback && isChosen && !isRight && <XCircle className="w-5 h-5 text-[#C0392B] shrink-0" aria-label="Your answer, incorrect" />}
              </button>
            );
          })}
        </div>

        {feedback && (
          <div role="status" className={`rounded-xl px-4 py-3 text-sm ${feedback.correct ? 'bg-[#E7F5EE] text-[#1E5A40]' : 'bg-[#FDECEA] text-[#8E2B20]'}`}>
            <p className="font-semibold">{feedback.correct ? 'Correct!' : `Not quite — the answer is ${LETTERS[feedback.correctIndex]}.`}</p>
            {feedback.explanation && <p className="mt-1">{feedback.explanation}</p>}
          </div>
        )}
        {error && <p role="alert" className="text-xs text-[#C0392B]">{error}</p>}
      </Card>

      {feedback && (
        <div className="flex justify-end">
          <Button
            inline
            onClick={() => {
              setFeedback(null);
              setIndex((i) => i + 1);
            }}
          >
            {index + 1 === total ? 'See my score' : 'Next question'}
          </Button>
        </div>
      )}
    </div>
  );
}
