'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { buildQuizPrompt, parseQuizJson } from '@/lib/library-quiz-import';

/**
 * "Make a quiz with AI": the teacher copies OUR prompt, gives it to an AI along
 * with the document, and pastes the reply back. The prompt is fixed text so the
 * reply always has the one shape parseQuizJson accepts. A valid paste becomes a
 * DRAFT quiz the teacher then edits and publishes — nothing reaches learners
 * straight from the AI.
 */
export function QuizImportPanel({
  contentId,
  onCreated,
  onCancel,
}: {
  contentId: string;
  onCreated: (quizId: string) => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState(10);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const prompt = useMemo(() => buildQuizPrompt(count), [count]);
  const result = useMemo(() => (text.trim() ? parseQuizJson(text) : null), [text]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the prompt is also shown in full below to select by hand.
    }
  }

  async function create() {
    if (!result?.ok) return;
    setBusy(true);
    setServerError('');
    try {
      const res = await fetch(`/api/library/content/${contentId}/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: result.quiz.title,
          questions: result.quiz.questions.map((q) => ({
            prompt: q.prompt,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
          })),
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message || 'Could not create the quiz.');
      onCreated(res.data.id);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Could not create the quiz.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-[#02465B]/10 p-4 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#02465B]">Make a quiz with AI</p>
        <ol className="mt-2 text-sm text-text-secondary list-decimal pl-5 space-y-1">
          <li>Copy the prompt below.</li>
          <li>Open your AI tool, attach this document, and paste the prompt.</li>
          <li>Paste the AI&apos;s reply into the box. You can edit everything before publishing.</li>
        </ol>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="quiz-count" className="text-xs font-medium text-[#666666]">Number of questions</label>
          <input
            id="quiz-count"
            type="number"
            min={1}
            max={30}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-24 rounded-lg border border-[#02465B]/15 px-3 py-2 text-sm"
          />
        </div>
        <Button inline variant="outline" onClick={() => void copyPrompt()}>
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
          {copied ? 'Copied' : 'Copy prompt'}
        </Button>
      </div>

      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer">Show the prompt</summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-[#F5F5F5] p-3 text-[11px] leading-relaxed text-[#011E28]">{prompt}</pre>
      </details>

      <div className="space-y-1.5">
        <label htmlFor="quiz-json" className="text-xs font-medium text-[#666666]">Paste the AI&apos;s reply</label>
        <textarea
          id="quiz-json"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "title": "...", "questions": [ ... ] }'
          className="w-full rounded-lg border border-[#02465B]/15 px-3 py-2 font-mono text-xs outline-none focus:border-[#02465B] focus:ring-2 focus:ring-[#02465B]/10"
        />
      </div>

      {result && !result.ok && (
        <ul role="alert" className="space-y-1 text-xs text-[#C0392B]">
          {result.errors.slice(0, 8).map((e) => (
            <li key={e} className="flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden /> {e}
            </li>
          ))}
          {result.errors.length > 8 && <li>…and {result.errors.length - 8} more. Ask the AI to fix these and paste again.</li>}
        </ul>
      )}
      {result?.ok && (
        <p role="status" className="text-xs text-[#1E5A40]">
          Looks good: “{result.quiz.title}” with {result.quiz.questions.length} question{result.quiz.questions.length === 1 ? '' : 's'}.
        </p>
      )}
      {serverError && <p role="alert" className="text-xs text-[#C0392B]">{serverError}</p>}

      <div className="flex flex-wrap gap-3">
        <Button inline onClick={() => void create()} isLoading={busy} disabled={busy || !result?.ok}>
          Create draft quiz
        </Button>
        <Button inline variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
