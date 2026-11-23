'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastProvider';
import { ChevronRight, GraduationCap, Users } from 'lucide-react';
import { COMPETENCY_RESULTS } from '@/lib/competency-exam';

interface ExamSummary {
  systemId: string;
  name: string;
  instructions: string;
  createdAt: string;
  markedCount: number;
}

/**
 * Competency Examination — Data Forms entry point.
 *
 * Lists the school's practical exams and starts new ones. Each exam is its
 * own register (see lib/entities/competency-exams.ts), so a school running
 * several practical modules in one term gets a separate mark per module.
 */
export default function CompetencyExamsPage() {
  const router = useRouter();
  const toast = useToast();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [nameError, setNameError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch('/api/staff/competency-exams')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setExams(d.data);
        else setLoadError(d.message || 'Could not load exams.');
      })
      .catch(() => setLoadError('Network error. Check your connection and reload.'))
      .finally(() => setLoading(false));
  }, []);

  async function startExam(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setNameError('Name the competency skill this exam checks.');
      return;
    }
    setNameError('');
    setStarting(true);
    try {
      const res = await fetch('/api/staff/competency-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: name.trim(), instructions: instructions.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message ?? 'Could not start the exam.');
        return;
      }
      if (!data.data.created) toast.success('An exam for this skill already exists. Opening it.');
      router.push(`/staff/competency/${data.data.systemId}`);
    } catch {
      toast.error('Network error. Check your connection and try again.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="w-full max-w-3xl">
      <Link href="/staff/forms" className="text-sm text-text-muted hover:text-primary-700">
        ← Data Forms
      </Link>
      <h1 className="text-2xl font-bold text-primary-900 mt-2 mb-1">Competency Examination</h1>
      <p className="text-sm text-text-muted mb-5">
        Record practical exam results. Each mark is added to the learner&apos;s results and their report for this term
        as soon as you save it.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {COMPETENCY_RESULTS.map((r) => (
          <div
            key={r.code}
            className={`rounded-xl px-3 py-2.5 ${
              r.code === 'completed'
                ? 'bg-[#E6F4EC] text-[#1A7A4A]'
                : r.code === 'incomplete'
                  ? 'bg-[#FDF1DE] text-[#9A5B00]'
                  : 'bg-bg-muted text-text-secondary'
            }`}
          >
            <p className="text-lg font-bold tabular-nums leading-tight">{r.score}%</p>
            <p className="text-xs text-text-primary/80 mt-0.5">{r.long}</p>
          </div>
        ))}
      </div>

      <Card className="p-5 mb-6">
        <form onSubmit={startExam} className="space-y-3">
          <p className="font-semibold text-primary-900">Start a new exam</p>
          <Input
            id="competency-exam-skill"
            label="COMPETENCY SKILL BEING CHECKED"
            placeholder="e.g. Creating a spreadsheet with formulas"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
          />
          <div>
            <label htmlFor="competency-exam-instructions" className="text-xs font-medium text-[#666666] tracking-wide">
              TASK INSTRUCTIONS (OPTIONAL)
            </label>
            <textarea
              id="competency-exam-instructions"
              value={instructions}
              maxLength={2000}
              rows={4}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="What must the learner do to show this skill? e.g. Open Excel, enter the sales table, total each column with SUM, and save the file as Sales.xlsx."
              className="mt-1.5 w-full rounded-xl border-2 border-[#E5E5E5] bg-white px-4 py-2.5 text-sm focus:border-[#02465B] focus:outline-none focus:ring-2 focus:ring-[#02465B]/10"
            />
            <p className="text-xs text-text-faint mt-1">
              Shown to every teacher marking this exam, so all classes are checked on the same task.
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" isLoading={starting}>
              Start exam
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">Your school&apos;s exams</p>
        <Link href="/staff/competency/marksheet" className="text-sm font-medium text-primary-700 hover:underline">
          View marksheet by term →
        </Link>
      </div>
      {loading ? (
        <p className="text-text-muted text-sm">Loading…</p>
      ) : loadError ? (
        <p className="text-error text-sm">{loadError}</p>
      ) : exams.length === 0 ? (
        <Card className="p-8 text-center">
          <GraduationCap className="w-10 h-10 text-text-faint mx-auto mb-3" />
          <p className="text-text-muted">No competency exams yet.</p>
          <p className="text-sm text-text-faint mt-1">Name the skill you are checking above to start marking.</p>
        </Card>
      ) : (
        <div className="grid gap-2.5">
          {exams.map((exam) => (
            <Link key={exam.systemId} href={`/staff/competency/${exam.systemId}`}>
              <Card hover className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-primary-900 truncate">{exam.name}</p>
                    {exam.instructions && (
                      <p className="text-sm text-text-muted mt-0.5 line-clamp-2">{exam.instructions}</p>
                    )}
                    <p className="flex items-center gap-1.5 mt-1 text-xs text-text-muted">
                      <Users className="w-3.5 h-3.5" aria-hidden />
                      {exam.markedCount} learner{exam.markedCount === 1 ? '' : 's'} marked · started{' '}
                      {new Date(exam.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-faint shrink-0" aria-hidden />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
