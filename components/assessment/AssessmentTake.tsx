'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertCircle, Clock, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';

interface Question {
  questionId: string;
  questionText: string;
  questionType: 'mcq' | 'text';
  options: string[];
  correctAnswer?: string;
}

export function AssessmentTake() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assessmentId = params.id;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number>(0);
  const [timeUp, setTimeUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState<number>(0); // in seconds

  // Load assessment details and questions
  useEffect(() => {
    async function fetchAssessmentData() {
      // Inside the fetchAssessmentData function
      try {
        // 1. Fetch assessment metadata
        const metaRes = await fetch(`/api/assessments/${assessmentId}`);
        if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}: ${metaRes.statusText}`);
        const metaData = await metaRes.json();
        if (!metaData.success) throw new Error(metaData.message || 'Assessment not found');

        // 2. Fetch questions
        const qRes = await fetch(`/api/assessments/${assessmentId}/questions`);
        if (!qRes.ok) throw new Error(`HTTP ${qRes.status}: ${qRes.statusText}`);
        const qData = await qRes.json();
        if (!qData.success) throw new Error(qData.message || 'Failed to load questions');

        // ... rest of code
      } catch (err) {
        console.error('Error loading assessment:', err);
        setError(err instanceof Error ? err.message : 'Failed to load assessment');
        setLoading(false);
      }
    }

    fetchAssessmentData();
  }, [assessmentId]);

  // Timer logic
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading || timeLimit === 0) return;

    // Get start timestamp from sessionStorage
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
        setTimeUp(true);
        if (timerRef.current) clearInterval(timerRef.current);
        // Auto-submit
        handleSubmit(true);
      }
    };

    timerRef.current = setInterval(updateTimer, 1000);
    updateTimer(); // initial

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, timeLimit, assessmentId]);

  // Persist answers and index to sessionStorage
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      sessionStorage.setItem(`assessment_${assessmentId}_answers`, JSON.stringify(answers));
    }
    sessionStorage.setItem(`assessment_${assessmentId}_index`, currentIndex.toString());
  }, [answers, currentIndex, assessmentId]);

  // Security: prevent copy/paste/right-click
  useEffect(() => {
    const preventCopy = (e: ClipboardEvent) => e.preventDefault();
    const preventContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('copy', preventCopy);
    document.addEventListener('paste', preventCopy);
    document.addEventListener('cut', preventCopy);
    document.addEventListener('contextmenu', preventContext);

    // Try full-screen (if user gesture allowed)
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => { });
    }

    return () => {
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('paste', preventCopy);
      document.removeEventListener('cut', preventCopy);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, []);

  // Warn on beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const goToQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index);
    }
  };

  const handleSubmit = async (auto = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Get student info
      const studentData = sessionStorage.getItem('assessmentStudent');
      if (!studentData) {
        router.push('/assessment');
        return;
      }
      const { school, className, studentName } = JSON.parse(studentData);

      const timeSpent = Math.round((Date.now() - (startTimeRef.current || Date.now())) / 1000);
      const payload = {
        studentName,
        school,
        className,
        assessmentId,
        answers,
        timeSpent,
      };

      const res = await fetch(`/api/assessments/${assessmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Submission failed.');
      }

      // Clear session storage for this assessment
      sessionStorage.removeItem(`assessment_${assessmentId}_answers`);
      sessionStorage.removeItem(`assessment_${assessmentId}_index`);
      sessionStorage.removeItem(`assessment_${assessmentId}_start`);

      // Navigate to confirmation
      router.push(`/assessment/confirmation?ref=${assessmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5FDFF] px-4">
        <p className="text-[#5A7A85]">Loading assessment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5FDFF] px-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-[#C0392B] mx-auto mb-4" />
          <p className="text-[#C0392B]">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push('/assessment')}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5FDFF] px-4">
        <div className="text-center">
          <p className="text-[#5A7A85]">No questions found for this assessment.</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push('/assessment/list')}>
            Back to List
          </Button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const total = questions.length;
  const isLast = currentIndex === total - 1;
  const isFirst = currentIndex === 0;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  const isTimeLow = remaining < 60;

  return (
    <div className="min-h-screen bg-[#F5FDFF] py-6 px-4">
      {/* Top bar */}
      <header className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#011E28]">{assessmentTitle}</h1>
          <p className="text-sm text-[#5A7A85]">
            Question {currentIndex + 1} of {total}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${isTimeLow ? 'bg-red-50 text-[#C0392B]' : 'bg-white text-[#011E28]'}`}>
            <Clock className="w-4 h-4" />
            <span className="font-mono font-bold text-lg">{timeStr}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="text-sm"
          >
            Submit
          </Button>
        </div>
      </header>

      {/* Question card */}
      <Card className="max-w-4xl mx-auto p-6">
        <div className="mb-4">
          <p className="text-xs font-medium text-[#02465B] uppercase tracking-wider">Question {currentIndex + 1}</p>
          <p className="text-lg font-medium text-[#011E28] mt-1">{currentQuestion.questionText}</p>
        </div>

        <div className="mt-4">
          {currentQuestion.questionType === 'mcq' ? (
            <div className="space-y-2">
              {currentQuestion.options.map((opt, idx) => (
                <label key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-[#02465B]/10 hover:bg-[#EBF8FC] cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name={`question-${currentQuestion.questionId}`}
                    value={opt}
                    checked={answers[currentQuestion.questionId] === opt}
                    onChange={() => handleAnswer(currentQuestion.questionId, opt)}
                    className="w-4 h-4 accent-[#02465B]"
                  />
                  <span className="text-sm text-[#011E28]">{opt}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              value={answers[currentQuestion.questionId] || ''}
              onChange={(e) => handleAnswer(currentQuestion.questionId, e.target.value)}
              placeholder="Type your answer here..."
              rows={4}
              className="w-full p-3 rounded-xl border border-[#02465B]/15 focus:border-[#02465B] focus:ring-2 focus:ring-[#02465B]/10 outline-none transition-all"
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#02465B]/08">
          <Button
            variant="outline"
            onClick={() => goToQuestion(currentIndex - 1)}
            disabled={isFirst}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <span className="text-xs text-[#9BBAC5]">
            {currentIndex + 1} of {total}
          </span>
          {isLast ? (
            <Button variant="primary" onClick={() => handleSubmit(false)} isLoading={submitting}>
              Submit Assessment <CheckCircle className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => goToQuestion(currentIndex + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </Card>

      {/* Auto-submit warning */}
      {isTimeLow && (
        <div className="max-w-4xl mx-auto mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-[#C0392B]">
          <AlertCircle className="w-4 h-4" />
          Time is running out! Your assessment will be submitted automatically when the timer reaches zero.
        </div>
      )}
    </div>
  );
}