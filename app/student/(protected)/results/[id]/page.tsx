'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/auth/AuthContext';
import { ArrowLeft, Check, Download, Minus, Share2, X } from 'lucide-react';

type Verdict = 'correct' | 'partial' | 'wrong' | 'unmarked';

interface MarkedAnswer {
  questionId: string;
  position: number;
  code: string;
  questionText: string;
  questionType: string;
  options: string[];
  imageUrl?: string;
  givenAnswer: string;
  correctAnswer?: string;
  modelAnswer?: string;
  score: number | null;
  maxScore: number;
  verdict: Verdict;
}

interface MarkedScript {
  assessmentSystemId: string;
  assessmentTitle: string;
  studentName: string;
  studentSystemId: string | null;
  school: string;
  className: string;
  submittedAt: string;
  totalScore: number | null;
  maxScore: number;
  percentage: number | null;
  answers: MarkedAnswer[];
}

const VERDICT: Record<Verdict, { label: string; className: string; Icon: typeof Check }> = {
  correct: { label: 'Correct', className: 'text-[#1F7A54] bg-[#E8F5EE]', Icon: Check },
  partial: { label: 'Partly correct', className: 'text-[#8A6A16] bg-[#FBF3E0]', Icon: Minus },
  wrong: { label: 'Not correct', className: 'text-[#A34C4C] bg-[#FBF0F0]', Icon: X },
  unmarked: { label: 'Not yet marked', className: 'text-[#5A7D8A] bg-[#F1F6F8]', Icon: Minus },
};

function formatAnswer(value: string, type: string): string {
  if (!value.trim()) return '';
  return type === 'checkbox'
    ? value.split('|').map((v) => v.trim()).filter(Boolean).join(', ')
    : value;
}

export default function StudentResultPage() {
  const params = useParams<{ id: string }>();
  const systemId = params.id;
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [script, setScript] = useState<MarkedScript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${systemId}/my-result`);
      const data = await res.json();
      if (data.success) setScript(data.data);
      else setError(data.message ?? 'Could not load your result.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [systemId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/assessment');
      return;
    }
    void (async () => {
      await load();
    })();
  }, [authLoading, isAuthenticated, router, load]);

  /**
   * Shares the PDF itself through the device's own share sheet, so WhatsApp,
   * email or anything else receives a file. Deliberately NOT a link: a URL to a
   * named child's results can be forwarded to anyone, and this keeps the family
   * in control of who sees it. Falls back to a download where the browser has
   * no share sheet.
   */
  async function share() {
    if (!script) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/assessments/${systemId}/my-result/pdf`);
      if (!res.ok) throw new Error('Could not prepare the file.');
      const blob = await res.blob();
      const file = new File([blob], `${script.assessmentSystemId}-result.pdf`, {
        type: 'application/pdf',
      });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${script.studentName} — ${script.assessmentTitle}`,
          text: `${script.studentName} scored ${script.totalScore}/${script.maxScore} (${script.percentage}%) in ${script.assessmentTitle}.`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      // A cancelled share sheet throws too; that is not worth an error message.
      if (e instanceof Error && e.name !== 'AbortError') setError(e.message);
    } finally {
      setSharing(false);
    }
  }

  if (authLoading || loading) {
    return <div className="p-8 text-center text-[#5A7A85]">Loading your result…</div>;
  }

  if (error || !script) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <Card>
          <p className="text-[#C26565] mb-4">{error || 'Result not found.'}</p>
          <Button variant="outline" onClick={() => router.push('/assessment/list')}>
            Back to assessments
          </Button>
        </Card>
      </div>
    );
  }

  const correctCount = script.answers.filter((a) => a.verdict === 'correct').length;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => router.push('/assessment/list')}
        className="inline-flex items-center gap-1.5 text-sm text-[#5A7D8A] hover:text-[#02465B]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Back to assessments
      </button>

      <Card>
        <p className="text-xs text-[#5A7D8A]">{script.school}</p>
        <h1 className="text-xl font-bold text-primary-900 mt-0.5">{script.assessmentTitle}</h1>
        <p className="text-sm text-[#5A7D8A] mt-1">
          {script.studentName}
          {script.className ? ` · ${script.className}` : ''} · Sat{' '}
          {new Date(script.submittedAt).toLocaleDateString('en-GB')}
        </p>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl bg-[#F1F6F8] p-3">
            <p className="text-[10px] text-[#5A7D8A] tracking-wide">SCORE</p>
            <p className="text-2xl font-bold text-primary-900">
              {script.totalScore ?? '—'}
              <span className="text-sm font-normal text-[#5A7D8A]">/{script.maxScore}</span>
            </p>
          </div>
          <div className="rounded-xl bg-[#F1F6F8] p-3">
            <p className="text-[10px] text-[#5A7D8A] tracking-wide">PERCENTAGE</p>
            <p className="text-2xl font-bold text-primary-900">
              {script.percentage === null ? '—' : `${script.percentage}%`}
            </p>
          </div>
          <div className="rounded-xl bg-[#F1F6F8] p-3">
            <p className="text-[10px] text-[#5A7D8A] tracking-wide">CORRECT</p>
            <p className="text-2xl font-bold text-primary-900">
              {correctCount}
              <span className="text-sm font-normal text-[#5A7D8A]">/{script.answers.length}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <a href={`/api/assessments/${systemId}/my-result/pdf`} download>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-1.5" aria-hidden />
              Download PDF
            </Button>
          </a>
          <Button onClick={() => void share()} isLoading={sharing}>
            <Share2 className="w-4 h-4 mr-1.5" aria-hidden />
            Share
          </Button>
        </div>
      </Card>

      {script.answers.map((a) => {
        const v = VERDICT[a.verdict];
        const given = formatAnswer(a.givenAnswer, a.questionType);
        const objective = !!a.correctAnswer;
        return (
          <Card key={a.questionId}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-primary-900 flex-1">
                {a.position}. {a.questionText}
              </p>
              <span className="text-sm font-semibold text-primary-900 shrink-0">
                {a.score ?? '—'}/{a.maxScore}
              </span>
            </div>

            {a.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.imageUrl}
                alt=""
                className="mt-2 max-h-40 rounded-lg object-contain bg-[#F1F6F8]"
              />
            )}

            <p className="text-[10px] text-[#5A7D8A] tracking-wide mt-3">YOUR ANSWER</p>
            {given ? (
              <p className="text-sm text-[#12333F] whitespace-pre-wrap">{given}</p>
            ) : (
              <p className="text-sm text-[#9BB3BD] italic">No answer given</p>
            )}

            {/* Only shown once the question is marked — an expected answer beside
                an unscored one invites arguing with a mark nobody has given. */}
            {a.verdict !== 'unmarked' && objective && a.verdict !== 'correct' && (
              <>
                <p className="text-[10px] text-[#5A7D8A] tracking-wide mt-3">CORRECT ANSWER</p>
                <p className="text-sm text-[#1F7A54]">
                  {formatAnswer(a.correctAnswer!, a.questionType)}
                </p>
              </>
            )}

            {a.verdict !== 'unmarked' && !objective && a.modelAnswer && (
              <>
                <p className="text-[10px] text-[#5A7D8A] tracking-wide mt-3">WHAT WAS EXPECTED</p>
                <p className="text-sm text-[#5A7D8A]">{a.modelAnswer}</p>
              </>
            )}

            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium mt-3 ${v.className}`}
            >
              <v.Icon className="w-3.5 h-3.5" aria-hidden />
              {v.label}
            </span>
          </Card>
        );
      })}

      <p className="text-xs text-text-muted text-center pb-4">
        Keep the PDF as your record of this paper.
      </p>
    </div>
  );
}
