'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/auth/AuthContext';
import { ArrowLeft, Check, Download, Minus, Share2, X } from 'lucide-react';
import { groupQuestions, formatQuestionLabel, isStemParent, type QuestionConfig } from '@/lib/questionGrouping';
import { MarkingGuidance } from '@/components/MarkingGuidance';

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
  config?: QuestionConfig;
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
  unmarked: { label: 'Not yet marked', className: 'text-[#666666] bg-[#FAFAFA]', Icon: Minus },
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
      router.push('/student');
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
    return <div className="p-8 text-center text-[#666666]">Loading your result…</div>;
  }

  if (error || !script) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <Card>
          <p className="text-[#C26565] mb-4">{error || 'Result not found.'}</p>
          <Button variant="outline" onClick={() => router.push('/student/list')}>
            Back to assessments
          </Button>
        </Card>
      </div>
    );
  }

  const correctCount = script.answers.filter((a) => a.verdict === 'correct').length;
  // A stem row (isStemParent) is never itself a scored question — counting
  // it in the denominator would understate the result (e.g. "3/5" when only
  // 4 rows were ever answerable).
  const answerableCount = script.answers.filter((a, i) => !isStemParent(script.answers, i)).length;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => router.push('/student/list')}
        className="inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#02465B]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Back to assessments
      </button>

      <Card>
        <p className="text-xs text-[#666666]">{script.school}</p>
        <h1 className="text-xl font-bold text-primary-900 mt-0.5">{script.assessmentTitle}</h1>
        <p className="text-sm text-[#666666] mt-1">
          {script.studentName}
          {script.className ? ` · ${script.className}` : ''} · Sat{' '}
          {new Date(script.submittedAt).toLocaleDateString('en-GB')}
        </p>

        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 mt-4">
          {/* The mark out of 100 leads — a paper out of 65 or 40 marks still
              reads the way Ugandan report cards do, with the raw score as a
              reference line underneath rather than the headline number. */}
          <div className="rounded-xl bg-[#FAFAFA] p-3">
            <p className="text-[10px] text-[#666666] tracking-wide">MARK</p>
            <p className="text-2xl font-bold text-primary-900">
              {script.percentage === null ? '—' : `${script.percentage}%`}
            </p>
            <p className="text-xs text-[#666666] mt-0.5">
              {script.totalScore ?? '—'}/{script.maxScore} marks
            </p>
          </div>
          <div className="rounded-xl bg-[#FAFAFA] p-3">
            <p className="text-[10px] text-[#666666] tracking-wide">CORRECT</p>
            <p className="text-2xl font-bold text-primary-900">
              {correctCount}
              <span className="text-sm font-normal text-[#666666]">/{answerableCount}</span>
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

      {groupQuestions(script.answers).map((group, gi) => (
        <div key={gi} className="space-y-4">
          {group.sectionChanged && group.section && (
            <p className="text-xs font-bold uppercase tracking-wider text-[#02465B] pt-2">
              Section {group.section}
            </p>
          )}
          {(group.groupImageUrl || group.groupHeading) && (
            // The heading reads "Use the diagram below..." — it prints
            // above the image it refers to, not after it.
            <Card className="space-y-2">
              {group.groupHeading && (
                <p className="text-sm italic text-[#666666]">{group.groupHeading}</p>
              )}
              {group.groupImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.groupImageUrl}
                  alt=""
                  className="max-h-40 rounded-lg object-contain bg-[#FAFAFA]"
                />
              )}
            </Card>
          )}
          {group.members.map((a, mi) => {
            const v = VERDICT[a.verdict];
            const given = formatAnswer(a.givenAnswer, a.questionType);
            const objective = !!a.correctAnswer;
            // The group's shared image is already shown above once — showing
            // it again per-member (it lives only on the anchor's row) would
            // duplicate it under every question in the group.
            const showOwnImage = a.imageUrl && a.imageUrl !== group.groupImageUrl;
            // A lettered part with roman-numeral children is a stem/prompt
            // only — never answered or scored itself; its roman children
            // carry those. See isStemParent, lib/questionGrouping.ts.
            const stem = isStemParent(
              script.answers,
              script.answers.findIndex((x) => x.questionId === a.questionId)
            );
            if (stem) {
              return (
                <Card key={a.questionId}>
                  <p className="font-medium text-primary-900">
                    {formatQuestionLabel(a.code, mi === 0)} {a.questionText}
                  </p>
                  {showOwnImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.imageUrl}
                      alt=""
                      className="mt-2 max-h-40 rounded-lg object-contain bg-[#FAFAFA]"
                    />
                  )}
                  <p className="text-xs text-[#A3A3A3] italic mt-2">Scored on the parts below.</p>
                </Card>
              );
            }
            return (
              <Card key={a.questionId}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-primary-900 flex-1">
                    {formatQuestionLabel(a.code, mi === 0)} {a.questionText}
                  </p>
                  <span className="text-sm font-semibold text-primary-900 shrink-0">
                    {a.score ?? '—'}/{a.maxScore}
                  </span>
                </div>

                {showOwnImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.imageUrl}
                    alt=""
                    className="mt-2 max-h-40 rounded-lg object-contain bg-[#FAFAFA]"
                  />
                )}

                <p className="text-[10px] text-[#666666] tracking-wide mt-3">YOUR ANSWER</p>
                {given ? (
                  <p className="text-sm text-[#12333F] whitespace-pre-wrap">{given}</p>
                ) : (
                  <p className="text-sm text-[#A3A3A3] italic">No answer given</p>
                )}

                {/* Only shown once the question is marked — an expected answer beside
                    an unscored one invites arguing with a mark nobody has given. */}
                {a.verdict !== 'unmarked' && objective && a.verdict !== 'correct' && (
                  <>
                    <p className="text-[10px] text-[#666666] tracking-wide mt-3">CORRECT ANSWER</p>
                    <p className="text-sm text-[#1F7A54]">
                      {formatAnswer(a.correctAnswer!, a.questionType)}
                    </p>
                  </>
                )}

                {a.verdict !== 'unmarked' && !objective && a.modelAnswer && (
                  <>
                    <p className="text-[10px] text-[#666666] tracking-wide mt-3">WHAT WAS EXPECTED</p>
                    <MarkingGuidance text={a.modelAnswer} />
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
        </div>
      ))}

      <p className="text-xs text-text-muted text-center pb-4">
        Keep the PDF as your record of this paper.
      </p>
    </div>
  );
}
