'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { QuizQuestionImage } from '@/components/library/quiz/QuizQuestionImage';

export interface EditorQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
}

export interface EditorQuiz {
  id: string;
  title: string;
  status: 'draft' | 'published';
  questions: EditorQuestion[];
}

const LETTERS = 'ABCDEF';
const field =
  'w-full rounded-lg border border-[#02465B]/15 bg-white px-3 py-2 text-sm text-[#011E28] outline-none focus:border-[#02465B] focus:ring-2 focus:ring-[#02465B]/10';

function blankQuestion(): EditorQuestion {
  return {
    id: crypto.randomUUID(),
    prompt: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    explanation: null,
    imageUrl: null,
    imagePublicId: null,
  };
}

/** Problems that would make the server refuse the save — surfaced next to the question, before the request. */
function problemsFor(q: EditorQuestion): string[] {
  const out: string[] = [];
  if (!q.prompt.trim()) out.push('Write the question.');
  const filled = q.options.map((o) => o.trim());
  if (filled.some((o) => !o)) out.push('Fill in every option, or remove the empty ones.');
  else if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) out.push('Two options are identical.');
  return out;
}

/**
 * The teacher's quiz editor: edit what the AI import produced (or write from
 * scratch), attach images, then publish. Multiple choice only, exactly one
 * correct answer per question — the radio beside each option IS the answer key.
 */
export function LibraryQuizEditor({
  initial,
  onTry,
}: {
  initial: EditorQuiz;
  onTry: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [questions, setQuestions] = useState<EditorQuestion[]>(initial.questions);
  const [status, setStatus] = useState(initial.status);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const edit = (fn: () => void) => {
    fn();
    setDirty(true);
    setMessage(null);
  };
  const patch = (id: string, p: Partial<EditorQuestion>) =>
    edit(() => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...p } : q))));

  function move(index: number, by: -1 | 1) {
    edit(() =>
      setQuestions((qs) => {
        const next = [...qs];
        const j = index + by;
        if (j < 0 || j >= next.length) return qs;
        [next[index], next[j]] = [next[j], next[index]];
        return next;
      })
    );
  }

  const allProblems = questions.map(problemsFor);
  const hasProblems = allProblems.some((p) => p.length > 0) || !title.trim();

  async function save(): Promise<boolean> {
    if (hasProblems) {
      setMessage({ kind: 'error', text: 'Fix the highlighted questions before saving.' });
      return false;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/library/quizzes/${initial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          questions: questions.map((q) => ({ ...q, options: q.options.map((o) => o.trim()), explanation: q.explanation?.trim() || null })),
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message || 'Could not save.');
      setDirty(false);
      setMessage({ kind: 'ok', text: 'Saved.' });
      return true;
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setPublished(published: boolean) {
    // Publishing what is on screen means saving it first; otherwise learners get the last save.
    if (published && dirty && !(await save())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/library/quizzes/${initial.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message || 'Could not update the quiz.');
      setStatus(published ? 'published' : 'draft');
      setMessage({ kind: 'ok', text: res.message });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not update the quiz.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`text-xs font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 ${
            status === 'published' ? 'bg-[#D6F0F7] text-[#02465B]' : 'bg-[#FCF3DE] text-[#8A6A16]'
          }`}
        >
          {status === 'published' ? 'Published — learners can take it' : 'Draft — only you can see it'}
        </span>
        <button type="button" onClick={onTry} className="text-sm font-medium text-[#02465B] hover:underline cursor-pointer">
          Try it as a learner
        </button>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="quiz-title" className="text-xs font-medium text-[#666666] tracking-wide">Quiz title</label>
        <input id="quiz-title" className={field} value={title} onChange={(e) => edit(() => setTitle(e.target.value))} />
      </div>

      {questions.length === 0 && <p className="text-sm text-text-muted">No questions yet. Add the first one below.</p>}

      {questions.map((q, i) => (
        <Card key={q.id} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B]">Question {i + 1}</p>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 rounded hover:bg-bg-muted disabled:opacity-30 cursor-pointer">
                <ArrowUp className="w-4 h-4" />
              </button>
              <button type="button" aria-label="Move down" disabled={i === questions.length - 1} onClick={() => move(i, 1)} className="p-1.5 rounded hover:bg-bg-muted disabled:opacity-30 cursor-pointer">
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label={`Delete question ${i + 1}`}
                onClick={() => edit(() => setQuestions((qs) => qs.filter((x) => x.id !== q.id)))}
                className="p-1.5 rounded text-[#C0392B] hover:bg-[#C0392B]/10 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <textarea
            className={field}
            rows={2}
            placeholder="Write the question"
            aria-label={`Question ${i + 1} text`}
            value={q.prompt}
            onChange={(e) => patch(q.id, { prompt: e.target.value })}
          />

          <QuizQuestionImage
            quizId={initial.id}
            inputId={`qimg-${q.id}`}
            imageUrl={q.imageUrl}
            onChange={(url, publicId) => patch(q.id, { imageUrl: url, imagePublicId: publicId })}
          />

          <fieldset className="space-y-2">
            <legend className="text-xs text-[#666666] mb-1">Options — select the correct one</legend>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  checked={q.correctIndex === oi}
                  onChange={() => patch(q.id, { correctIndex: oi })}
                  aria-label={`Option ${LETTERS[oi]} is correct`}
                  className="accent-[#02465B] shrink-0"
                />
                <span className="text-xs font-semibold text-[#02465B] w-4">{LETTERS[oi]}</span>
                <input
                  className={field}
                  value={opt}
                  aria-label={`Option ${LETTERS[oi]}`}
                  onChange={(e) => patch(q.id, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })}
                />
                {q.options.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Remove option ${LETTERS[oi]}`}
                    onClick={() =>
                      patch(q.id, {
                        options: q.options.filter((_, k) => k !== oi),
                        // Keep pointing at the same option text, or at the last one if the correct one was removed.
                        correctIndex: q.correctIndex === oi ? 0 : q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex,
                      })
                    }
                    className="p-1.5 rounded text-[#A3A3A3] hover:text-[#C0392B] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {q.options.length < 6 && (
              <button type="button" onClick={() => patch(q.id, { options: [...q.options, ''] })} className="text-xs font-medium text-[#02465B] hover:underline cursor-pointer">
                + Add an option
              </button>
            )}
          </fieldset>

          <input
            className={field}
            placeholder="Explanation shown after answering (optional)"
            aria-label={`Question ${i + 1} explanation`}
            value={q.explanation ?? ''}
            onChange={(e) => patch(q.id, { explanation: e.target.value })}
          />

          {allProblems[i].length > 0 && (
            <ul role="alert" className="text-xs text-[#C0392B] space-y-0.5">
              {allProblems[i].map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      <Button variant="outline" inline onClick={() => edit(() => setQuestions((qs) => [...qs, blankQuestion()]))}>
        <Plus className="w-4 h-4" aria-hidden /> Add a question
      </Button>

      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-white/95 backdrop-blur border-t border-[#EAEAEA] flex flex-wrap items-center gap-3">
        <Button inline onClick={() => void save()} isLoading={busy} disabled={busy || !dirty}>
          Save changes
        </Button>
        {status === 'draft' ? (
          <Button inline variant="secondary" onClick={() => void setPublished(true)} disabled={busy || questions.length === 0}>
            <CheckCircle2 className="w-4 h-4" aria-hidden /> Publish for learners
          </Button>
        ) : (
          <Button inline variant="outline" onClick={() => void setPublished(false)} disabled={busy}>
            Unpublish
          </Button>
        )}
        {dirty && <span className="text-xs text-[#8A6A16]">Unsaved changes</span>}
        {message && (
          <span role={message.kind === 'error' ? 'alert' : 'status'} className={`text-xs ${message.kind === 'error' ? 'text-[#C0392B]' : 'text-[#02465B]'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
