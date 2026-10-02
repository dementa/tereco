'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { LibraryQuizPlayer, type CheckAnswer, type PlayableQuiz } from '@/components/library/quiz/LibraryQuizPlayer';
import { getSaved, localCheck, toPlayableQuiz } from '@/lib/library-offline-store';
import { LibraryQuizEditor, type EditorQuiz } from '@/components/library/quiz/LibraryQuizEditor';

type Play = PlayableQuiz & { contentId: string; canManage: boolean };

/**
 * One route, two audiences. Whoever manages the document lands in the editor
 * (with a way to try the quiz as a learner); everyone else lands in the
 * player. The server decides which — this only asks /play, which any viewer
 * of a published quiz may call, and then /quizzes/[id] for the editable copy
 * if `canManage` says the caller is entitled to it.
 *
 * With no network, a quiz on a public item saved to this device (Save for
 * offline) is played from that copy and marked against its saved key.
 */
export function LibraryQuizPage() {
  const { id, quizId } = useParams<{ id: string; quizId: string }>();
  const pathname = usePathname();
  const backHref = pathname.replace(/\/quiz\/[^/]+$/, '');

  const [play, setPlay] = useState<Play | null>(null);
  const [editable, setEditable] = useState<EditorQuiz | null>(null);
  const [trying, setTrying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offlineCheck, setOfflineCheck] = useState<CheckAnswer | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetch(`/api/library/quizzes/${quizId}/play`)
          .then((r) => r.json())
          .catch(async (networkError) => {
            const quiz = (await getSaved(id).catch(() => null))?.quizzes.find((q) => q.id === quizId);
            if (!quiz) throw networkError;
            // A function in state must be wrapped, or React calls it as an updater.
            setOfflineCheck(() => localCheck(quiz));
            return { success: true, data: { ...toPlayableQuiz(quiz), contentId: id, canManage: false } };
          });
        if (!p.success) throw new Error(p.message || 'Could not load this quiz.');
        setPlay(p.data);
        if (p.data.canManage) {
          const e = await fetch(`/api/library/quizzes/${quizId}`).then((r) => r.json());
          if (!e.success) throw new Error(e.message || 'Could not load the editor.');
          setEditable(e.data);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, quizId]);

  // Entering "try it" re-reads the learner copy so it reflects what was just
  // saved. The editor stays mounted (only hidden) so unsaved edits survive the trip.
  async function startTry() {
    const p = await fetch(`/api/library/quizzes/${quizId}/play`).then((r) => r.json()).catch(() => null);
    if (p?.success) setPlay(p.data);
    setTrying(true);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary-700 mb-4">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back to the document
      </Link>

      {loading && <p className="text-sm text-text-muted">Loading…</p>}
      {!loading && error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {play && (
        <>
          <h1 className="text-2xl font-bold text-primary-900 break-words mb-5">{editable && !trying ? 'Edit quiz' : play.title}</h1>
          {editable && (
            <div hidden={trying}>
              <LibraryQuizEditor initial={editable} onTry={() => void startTry()} />
            </div>
          )}
          {(!editable || trying) && (
            <>
              {trying && (
                <button type="button" onClick={() => setTrying(false)} className="mb-4 text-sm font-medium text-[#02465B] hover:underline cursor-pointer">
                  ← Back to editing
                </button>
              )}
              <LibraryQuizPlayer key={play.questions.map((q) => q.id).join()} quiz={play} check={offlineCheck} />
            </>
          )}
        </>
      )}
    </div>
  );
}
