'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertCircle, Clock, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

type QuestionType = 'mcq' | 'checkbox' | 'fill' | 'matching' | 'dragdrop' | 'short' | 'long';

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
}

const CHECKBOX_SEP = ' | ';

export function AssessmentTake() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assessmentId = params.id;
  const { isAuthenticated, user, loading: authLoading } = useAuth();

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

  // ─── Auth guard ────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || user?.role !== 'student') {
      router.push('/assessment');
    }
  }, [authLoading, isAuthenticated, user, router]);

  // ─── Load assessment metadata + questions ────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchAssessmentData() {
      try {
        const metaRes = await fetch(`/api/assessments/${assessmentId}`);
        if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}: ${metaRes.statusText}`);
        const metaData = await metaRes.json();
        if (!metaData.success) throw new Error(metaData.message || 'Assessment not found');

        const qRes = await fetch(`/api/assessments/${assessmentId}/questions`);
        if (!qRes.ok) throw new Error(`HTTP ${qRes.status}: ${qRes.statusText}`);
        const qData = await qRes.json();
        if (!qData.success) throw new Error(qData.message || 'Failed to load questions');

        if (cancelled) return;

        const meta = metaData.data;
        setAssessmentTitle(meta?.title ?? 'Assessment');
        setTimeLimit((meta?.timeLimit ?? 0) * 60);
        setQuestions(Array.isArray(qData.data) ? qData.data : []);

        // Restore any in-progress answers/index
        const savedAnswers = sessionStorage.getItem(`assessment_${assessmentId}_answers`);
        if (savedAnswers) {
          try { setAnswers(JSON.parse(savedAnswers)); } catch { /* ignore */ }
        }
        const savedIndex = sessionStorage.getItem(`assessment_${assessmentId}_index`);
        if (savedIndex) setCurrentIndex(parseInt(savedIndex, 10) || 0);
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
  }, [assessmentId]);

  const submitAnswers = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const timeSpent = Math.round((Date.now() - (startTimeRef.current || Date.now())) / 1000);
      const res = await fetch(`/api/assessments/${assessmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, timeSpent }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Submission failed.');

      sessionStorage.removeItem(`assessment_${assessmentId}_answers`);
      sessionStorage.removeItem(`assessment_${assessmentId}_index`);
      sessionStorage.removeItem(`assessment_${assessmentId}_start`);
      router.push(`/assessment/confirmation?ref=${encodeURIComponent(assessmentId)}`);
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [answers, assessmentId, router]);

  // ─── Timer ───────────────────────────────────────────────
  useEffect(() => {
    if (loading || timeLimit === 0) return;

    const storedStart = sessionStorage.getItem(`assessment_${assessmentId}_start`);
    let start = storedStart ? parseInt(storedStart, 10) : null;
    if (!start) {
      start = Date.now();
      sessionStorage.setItem(`assessment_${assessmentId}_start`, start.toString());
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
  }, [loading, timeLimit, assessmentId, submitAnswers]);

  // ─── Persist progress ────────────────────────────────────
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      sessionStorage.setItem(`assessment_${assessmentId}_answers`, JSON.stringify(answers));
    }
    sessionStorage.setItem(`assessment_${assessmentId}_index`, currentIndex.toString());
  }, [answers, currentIndex, assessmentId]);

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
          <Button className="mt-4" variant="outline" onClick={() => router.push('/assessment')}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="text-center">
          <p className="text-text-muted">No questions found for this assessment.</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push('/assessment/list')}>Back to List</Button>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  const total = questions.length;
  const isLast = currentIndex === total - 1;
  const isFirst = currentIndex === 0;
  const answeredCount = questions.filter(qq => (answers[qq.id] ?? '').trim() !== '').length;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  const isTimeLow = timeLimit > 0 && remaining < 60;

  const checkboxSelected = q.questionType === 'checkbox' && answers[q.id]
    ? answers[q.id].split(CHECKBOX_SEP)
    : [];

  return (
    <div className="min-h-screen bg-bg py-6 px-4">
      <header className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-primary-900">{assessmentTitle}</h1>
          <p className="text-sm text-text-muted">
            Question {currentIndex + 1} of {total} • {answeredCount} answered
          </p>
        </div>
        <div className="flex items-center gap-3">
          {timeLimit > 0 && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${isTimeLow ? 'bg-error-bg text-error' : 'bg-white text-primary-900'}`}>
              <Clock className="w-4 h-4" />
              <span className="font-mono font-bold text-lg">{timeStr}</span>
            </div>
          )}
          <Button variant="outline" onClick={submitAnswers} disabled={submitting} className="text-sm">
            Submit
          </Button>
        </div>
      </header>

      <Card className="max-w-4xl mx-auto p-6">
        <div className="mb-4">
          <p className="text-xs font-medium text-primary-700 uppercase tracking-wider">
            Question {currentIndex + 1}
            {q.maxScore ? ` • ${q.maxScore} mark${q.maxScore === 1 ? '' : 's'}` : ''}
          </p>
          <p className="text-lg font-medium text-primary-900 mt-1">{q.questionText}</p>

          {q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={q.imageUrl}
              alt=""
              className="mt-3 max-h-72 w-auto rounded-xl object-contain bg-[#F1F6F8]"
            />
          )}
        </div>

        <div className="mt-4">
          {q.questionType === 'mcq' && (
            <div className="space-y-2">
              {q.options.map((opt, idx) => (
                <label key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-primary-700/10 hover:bg-primary-50 cursor-pointer transition-colors">
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
                <label key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-primary-700/10 hover:bg-primary-50 cursor-pointer transition-colors">
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
              className="w-full p-3 rounded-xl border border-primary-700/15 focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10 outline-none transition-all"
            />
          )}

          {(q.questionType === 'long' || q.questionType === 'matching' || q.questionType === 'dragdrop') && (
            <textarea
              value={answers[q.id] || ''}
              onChange={(e) => handleAnswer(q.id, e.target.value)}
              placeholder="Type your answer here..."
              rows={5}
              className="w-full p-3 rounded-xl border border-primary-700/15 focus:border-primary-700 focus:ring-2 focus:ring-primary-700/10 outline-none transition-all"
            />
          )}
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-primary-700/10">
          <Button variant="outline" onClick={() => goToQuestion(currentIndex - 1)} disabled={isFirst}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <span className="text-xs text-text-faint">{currentIndex + 1} of {total}</span>
          {isLast ? (
            <Button variant="primary" onClick={submitAnswers} isLoading={submitting}>
              Submit Assessment <CheckCircle className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => goToQuestion(currentIndex + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </Card>

      {/* Question navigator */}
      <div className="max-w-4xl mx-auto mt-4 flex flex-wrap gap-2">
        {questions.map((qq, idx) => {
          const answered = (answers[qq.id] ?? '').trim() !== '';
          const active = idx === currentIndex;
          return (
            <button
              key={qq.id}
              onClick={() => goToQuestion(idx)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-primary-700 text-white'
                  : answered
                    ? 'bg-primary-100 text-primary-800'
                    : 'bg-white text-text-muted border border-primary-700/10'
              }`}
            >
              {idx + 1}
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
