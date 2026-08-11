'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertCircle, BookOpen, Clock, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { resolveSource, type TakeMode } from '@/lib/assessment/source';
import {
  groupQuestions,
  formatQuestionLabel,
  isStemParent,
  stemParentIndex,
  type QuestionConfig,
} from '@/lib/questionGrouping';

// 'true_false' MUST be here. It was added to the schema after this component
// was written, and because this union is local rather than shared with
// lib/assessments.ts, tsc could not see the omission: the type simply matched
// no render branch, so the question appeared with its text and no way to
// answer it. Learners skipped every one of them.
type QuestionType =
  | 'mcq' | 'checkbox' | 'true_false' | 'fill' | 'matching' | 'dragdrop' | 'short' | 'long';

interface Question {
  /** The question's uuid. Answers are keyed by this — the submit route
   *  matches on it, so it must not be confused with the display code. */
  id: string;
  /** Human-facing label shown to the student: Q1, Q2, ... */
  code: string;
  position: number;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  /** Cloudinary delivery URL for a picture question. The image IS the
   *  question for these — "name the shape below" is unanswerable without it. */
  imageUrl?: string;
  maxScore?: number;
  /** Section/grouping metadata — see lib/questionGrouping.ts. A group's
   *  shared image lives only on its anchor member's imageUrl, never
   *  duplicated onto its siblings, so it must be looked up via the group
   *  rather than the current question alone. */
  config?: QuestionConfig;
}

const CHECKBOX_SEP = ' | ';

/**
 * Live sitting, or untimed practice on a closed paper (an E-Paper).
 *
 * One component rather than two because the paper is the same paper: the same
 * question rendering, the same grouping and stem rules, the same answer
 * capture. Only the clock, the endpoint, and where "finish" goes differ. A
 * forked copy would drift on question rendering, which is where all the real
 * complexity is.
 *
 * The mode is re-exported from the source, which is where it now has to live:
 * it decides the endpoint AND the storage keys, and both of those moved there
 * when the offline client arrived.
 */
export type { TakeMode };

export function AssessmentTake({ mode = 'live' }: { mode?: TakeMode } = {}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assessmentId = params.id;
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const isPractice = mode === 'practice';

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState<number>(0); // seconds

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const submittedRef = useRef(false);
  /** Seconds left according to the SERVER when the sitting was last anchored. */
  const serverRemainingRef = useRef<number | null>(null);
  /** Set only on the desktop, where the sitting is a row in the local database. */
  const attemptIdRef = useRef<string | undefined>(undefined);

  /**
   * Where this paper's data comes from: the API in a browser, the local SQLite
   * database in TERECO Collect. Resolved once — the answer cannot change
   * mid-sitting, and re-resolving would rebuild the effect dependencies below.
   */
  const source = useMemo(() => resolveSource(), []);

  const studentId = user?.id ?? '';

  /** Everything the source needs to know about which paper, and whose. */
  const context = useMemo(
    () => ({ mode, studentId, assessmentId }),
    [mode, studentId, assessmentId]
  );

  // ─── Auth guard ────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || user?.role !== 'student') {
      router.push('/student');
    }
  }, [authLoading, isAuthenticated, user, router]);

  // ─── Load assessment metadata + questions ────────────────
  // Waits for the signed-in learner: the progress keys are scoped to their id,
  // so loading before it is known would read and write the wrong ones.
  useEffect(() => {
    if (authLoading || !studentId) return;
    let cancelled = false;
    async function fetchAssessmentData() {
      try {
        // The source decides where this comes from: the API in a browser, the
        // local SQLite database in TERECO Collect where there is no network at
        // all. Practice is untimed and never opens a sitting; the source knows
        // that too, so this reads the same either way.
        const paper = await source.load({ ...context, studentId });

        if (cancelled) return;

        setAssessmentTitle(paper.title);
        setTimeLimit(paper.timeLimitSeconds);
        setQuestions(paper.questions);
        setAnswers(paper.answers);
        setCurrentIndex(paper.currentIndex);
        serverRemainingRef.current = paper.remainingSeconds;
        attemptIdRef.current = paper.attemptId;
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading assessment:', err);
          setError(err instanceof Error ? err.message : 'Failed to load assessment');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAssessmentData();
    return () => { cancelled = true; };
  }, [assessmentId, authLoading, studentId, source, context]);

  const submitAnswers = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const timeSpent = Math.round((Date.now() - (startTimeRef.current || Date.now())) / 1000);

      // In a browser this posts to the API — the live submit route, or the
      // E-Paper attempt route for practice. In TERECO Collect it marks the
      // attempt submitted in SQLite and queues it, with no network at all.
      const result = await source.submit(
        { ...context, attemptId: attemptIdRef.current },
        { answers, timeSpent }
      );

      source.clearProgress(context);

      if (isPractice && result.attemptId) {
        // Straight to the marked paper. The whole reason a learner practises is
        // to see what was expected, so an intermediate "submitted!" screen would
        // just be a click between them and the answer.
        router.push(`/student/attempts/${encodeURIComponent(result.attemptId)}`);
      } else {
        router.push(`/student/confirmation?ref=${encodeURIComponent(assessmentId)}`);
      }
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [answers, assessmentId, router, source, context, isPractice]);

  // ─── Timer ───────────────────────────────────────────────
  useEffect(() => {
    if (loading || timeLimit === 0) return;

    // The server's answer wins. It is the only clock a learner cannot reset by
    // clearing storage or rebooting the machine, which is exactly what a power
    // cut used to do — the old code found no stored start and handed out a
    // fresh full countdown.
    const serverRemaining = serverRemainingRef.current;
    let start: number;
    if (serverRemaining !== null) {
      start = Date.now() - (timeLimit - serverRemaining) * 1000;
      source.writeStart(context, start);
    } else {
      // No server answer (offline). Fall back to a locally remembered start so
      // the learner can keep working; it re-anchors when the network returns.
      start = source.readStart(context) ?? Date.now();
      source.writeStart(context, start);
    }
    startTimeRef.current = start;

    const updateTimer = () => {
      if (!startTimeRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const remainingSeconds = Math.max(0, timeLimit - elapsed);
      setRemaining(Math.floor(remainingSeconds));
      if (remainingSeconds <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        submitAnswers();
      }
    };

    timerRef.current = setInterval(updateTimer, 1000);
    updateTimer();

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading, timeLimit, submitAnswers, source, context]);

  // ─── Persist progress ────────────────────────────────────
  // Written on every keystroke-level change, because the interruption is never
  // announced. Where it lands is the source's business: localStorage in a
  // browser, an fsynced SQLite row in TERECO Collect.
  //
  // Waits for `loading` to clear. This effect used to run on mount, while the
  // loader above was still fetching, and unconditionally wrote currentIndex —
  // which is 0 before anything is restored. By the time the loader read the
  // stored index back it was reading the 0 this effect had just written over
  // it, so a learner who reloaded mid-paper always landed back on question 1.
  // Answers escaped it only because that write is guarded by `length > 0` and
  // the initial state is empty.
  useEffect(() => {
    if (!studentId || loading) return;
    source.saveProgress({ ...context, attemptId: attemptIdRef.current }, answers, currentIndex);
  }, [answers, currentIndex, studentId, loading, source, context]);

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const toggleCheckbox = (questionId: string, option: string) => {
    setAnswers(prev => {
      const current = prev[questionId] ? prev[questionId].split(CHECKBOX_SEP) : [];
      const next = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      return { ...prev, [questionId]: next.join(CHECKBOX_SEP) };
    });
  };

  const goToQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) setCurrentIndex(index);
  };

  // A group's shared heading/image is looked up here rather than read off the
  // current question directly, because only the group's anchor member's row
  // actually carries imageUrl/groupImageTitle — every other member's config
  // just points at the same groupId.
  const groups = useMemo(() => groupQuestions(questions), [questions]);
  const currentGroup = groups.find((g) => g.members.some((m) => m.id === questions[currentIndex]?.id));

  // Mirrors formatQuestionLabel usage in the builder, results, marking and PDF
  // views: a lettered "sub" run (22a/22b/22c) prints as "22. (a)", "(b)", "(c)"
  // everywhere else, so the live sitting screen must use the same lookup
  // rather than echoing the raw stored code.
  const labelByQuestionId = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => {
      g.members.forEach((m, mi) => map.set(m.id, formatQuestionLabel(m.code, mi === 0)));
    });
    return map;
  }, [groups]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <p className="text-text-muted">Loading assessment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
          <p className="text-error">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push('/student')}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="text-center">
          <p className="text-text-muted">No questions found for this assessment.</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => router.push(isPractice ? '/student/library' : '/student/list')}
          >
            {isPractice ? 'Back to Library' : 'Back to List'}
          </Button>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  const total = questions.length;
  const isLast = currentIndex === total - 1;
  const isFirst = currentIndex === 0;
  // Answered count only ever needs to reflect questions the learner could
  // actually answer — a stem row never gets a response of its own.
  const answeredCount = questions.filter(
    (qq, i) => !isStemParent(questions, i) && (answers[qq.id] ?? '').trim() !== ''
  ).length;

  // A lettered part with roman-numeral children is a stem/prompt only —
  // "Identify the parts labelled:" — never answered itself; see
  // isStemParent in lib/questionGrouping.ts. Its roman children print the
  // stem's own text (and image, if any) above their own, so the context
  // isn't lost when navigating straight to "(i)" or "(ii)".
  const stem = isStemParent(questions, currentIndex);
  const stemParentIdx = stemParentIndex(questions, currentIndex);
  const stemQuestion = stemParentIdx !== null ? questions[stemParentIdx] : null;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  const isTimeLow = timeLimit > 0 && remaining < 60;

  const checkboxSelected = q.questionType === 'checkbox' && answers[q.id]
    ? answers[q.id].split(CHECKBOX_SEP)
    : [];

  return (
    <div className="min-h-screen bg-bg py-4 sm:py-6 px-3 sm:px-4">
      {/*
        On a phone the timer is the thing a learner glances at mid-question, so
        it and Submit stay on their own full-width line under the title rather
        than competing with it for horizontal space.
      */}
      <header className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-primary-900 break-words">{assessmentTitle}</h1>
          <p className="text-sm text-text-muted">
            Question {currentIndex + 1} of {total} • {answeredCount} answered
          </p>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          {/*
            Practice says so where the clock would be. The absence of a timer is
            the feature — a learner who has only ever sat timed papers will keep
            hunting for the countdown otherwise, and rush anyway.
          */}
          {isPractice ? (
            <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-white text-primary-900">
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Practice • no timer</span>
            </div>
          ) : (
            timeLimit > 0 && (
              <div className={`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl ${isTimeLow ? 'bg-error-bg text-error' : 'bg-white text-primary-900'}`}>
                <Clock className="w-4 h-4 shrink-0" />
                <span className="font-mono font-bold text-base sm:text-lg tabular-nums">{timeStr}</span>
              </div>
            )
          )}
          <Button inline variant="outline" onClick={submitAnswers} disabled={submitting} className="text-sm">
            {isPractice ? 'Finish' : 'Submit'}
          </Button>
        </div>
      </header>

      <Card className="max-w-4xl mx-auto p-3.5 sm:p-6">
        <div className="mb-4">
          {q.config?.section && (
            <p className="text-[10px] font-semibold text-[#666666] uppercase tracking-wider mb-1">
              Section {q.config.section}
            </p>
          )}
          <p className="text-xs font-medium text-primary-700 uppercase tracking-wider">
            Question {labelByQuestionId.get(q.id) ?? q.code}
            {q.maxScore ? ` • ${q.maxScore} mark${q.maxScore === 1 ? '' : 's'}` : ''}
          </p>

          {currentGroup?.groupImageUrl && (
            <>
              {/* The composed heading reads "Use the diagram below to answer
                  question(s)..." — it has to print above the image it refers
                  to, not after it. */}
              {currentGroup.groupHeading && (
                <p className="text-sm italic text-[#666666] mt-2">{currentGroup.groupHeading}</p>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentGroup.groupImageUrl}
                alt=""
                className="mt-3 max-h-56 sm:max-h-72 max-w-full w-auto rounded-xl object-contain bg-[#FAFAFA]"
              />
            </>
          )}

          {/* Roman-numeral parts repeat their stem's own text (and image, if
              any) here — the stem itself is never its own screen the
              learner answers, so its context has to travel with each part.
              Text first ("Identify the parts labelled below") since it
              introduces the diagram, not the other way round. */}
          {stemQuestion && (
            <>
              <p className="text-lg font-medium text-primary-900 mt-2">{stemQuestion.questionText}</p>
              {stemQuestion.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stemQuestion.imageUrl}
                  alt=""
                  className="mt-3 max-h-56 sm:max-h-72 max-w-full w-auto rounded-xl object-contain bg-[#FAFAFA]"
                />
              )}
            </>
          )}

          <p className="text-lg font-medium text-primary-900 mt-2">{q.questionText}</p>
          {stem && (
            <p className="text-sm text-text-muted mt-1">See the numbered parts below to answer.</p>
          )}

          {q.imageUrl && q.imageUrl !== currentGroup?.groupImageUrl && (
            <>
              {/* A true shared stimulus already printed its caption above,
                  next to the group's own image — this is the standalone
                  case, where the description belongs with the picture it's
                  actually describing. Printed above the image, same as the
                  shared-stimulus case: the text reads "diagram below". */}
              {!currentGroup?.groupImageUrl && currentGroup?.groupHeading && (
                <p className="text-sm italic text-[#666666] mt-2">{currentGroup.groupHeading}</p>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={q.imageUrl}
                alt=""
                className="mt-3 max-h-56 sm:max-h-72 max-w-full w-auto rounded-xl object-contain bg-[#FAFAFA]"
              />
            </>
          )}
        </div>

        {!stem && (
        <div className="mt-4">
          {/* True/false is a two-option multiple choice and answers identically:
              one radio per option, where the options are always True and False. */}
          {(q.questionType === 'mcq' || q.questionType === 'true_false') && (
            <div className="space-y-2">
              {q.options.map((opt, idx) => (
                <label key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-bg-muted cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name={`question-${q.id}`}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => handleAnswer(q.id, opt)}
                    className="w-4 h-4 accent-primary-700"
                  />
                  <span className="text-sm text-primary-900">{opt}</span>
                </label>
              ))}
            </div>
          )}

          {q.questionType === 'checkbox' && (
            <div className="space-y-2">
              {q.options.map((opt, idx) => (
                <label key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-bg-muted cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={checkboxSelected.includes(opt)}
                    onChange={() => toggleCheckbox(q.id, opt)}
                    className="w-4 h-4 accent-primary-700"
                  />
                  <span className="text-sm text-primary-900">{opt}</span>
                </label>
              ))}
            </div>
          )}

          {(q.questionType === 'fill' || q.questionType === 'short') && (
            <input
              type="text"
              value={answers[q.id] || ''}
              onChange={(e) => handleAnswer(q.id, e.target.value)}
              placeholder="Type your answer..."
              className="w-full p-3 rounded-xl border border-border focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10 outline-none transition-all"
            />
          )}

          {(q.questionType === 'long' || q.questionType === 'matching' || q.questionType === 'dragdrop') && (
            <textarea
              value={answers[q.id] || ''}
              onChange={(e) => handleAnswer(q.id, e.target.value)}
              placeholder="Type your answer here..."
              rows={5}
              className="w-full p-3 rounded-xl border border-border focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10 outline-none transition-all"
            />
          )}
        </div>
        )}

        {/*
          `inline` on all three: these buttons share a row at every width, and
          the default full-width-on-phones behaviour made Previous and Next each
          claim the whole line and crush each other around the counter.
        */}
        <div className="flex justify-between items-center gap-2 mt-6 pt-4 border-t border-border">
          <Button inline variant="outline" onClick={() => goToQuestion(currentIndex - 1)} disabled={isFirst}>
            <ChevronLeft className="w-4 h-4 sm:mr-1" />
            <span className="hidden xs:inline">Previous</span>
          </Button>
          <span className="text-xs text-text-faint tabular-nums shrink-0">{currentIndex + 1} of {total}</span>
          {isLast ? (
            <Button inline variant="primary" onClick={submitAnswers} isLoading={submitting}>
              <span className="xs:hidden">{isPractice ? 'Finish' : 'Submit'}</span>
              <span className="hidden xs:inline">
                {isPractice ? 'Finish & see answers' : 'Submit Assessment'}
              </span>
              <CheckCircle className="w-4 h-4 sm:ml-1" />
            </Button>
          ) : (
            <Button inline variant="primary" onClick={() => goToQuestion(currentIndex + 1)}>
              <span className="hidden xs:inline">Next</span>
              <ChevronRight className="w-4 h-4 sm:ml-1" />
            </Button>
          )}
        </div>
      </Card>

      {/* Question navigator */}
      <div className="max-w-4xl mx-auto mt-4 flex flex-wrap gap-2">
        {questions.map((qq, idx) => {
          // A stem row is never answered itself — don't flag it as
          // outstanding, there's nothing for the learner to fill in here.
          const answered = isStemParent(questions, idx) || (answers[qq.id] ?? '').trim() !== '';
          const active = idx === currentIndex;
          return (
            <button
              key={qq.id}
              onClick={() => goToQuestion(idx)}
              className={`min-w-9 h-9 px-1.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-primary-700 text-white'
                  : answered
                    ? 'bg-primary-100 text-primary-800'
                    : 'bg-white text-text-muted border border-border'
              }`}
            >
              {labelByQuestionId.get(qq.id) ?? qq.code}
            </button>
          );
        })}
      </div>

      {isTimeLow && (
        <div className="max-w-4xl mx-auto mt-4 p-3 bg-error-bg border border-error/20 rounded-xl flex items-center gap-2 text-sm text-error">
          <AlertCircle className="w-4 h-4" />
          Time is running out! Your assessment will be submitted automatically when the timer reaches zero.
        </div>
      )}
    </div>
  );
}
