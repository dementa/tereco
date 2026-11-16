'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/components/auth/AuthContext';
import { Check, Search } from 'lucide-react';
import {
  COMPETENCY_MAX_SCORE,
  COMPETENCY_RESULTS,
  competencyResultFromScore,
  competencyScore,
  type CompetencyResult,
} from '@/lib/competency-exam';

interface Stream {
  id: string;
  name: string;
}
interface SchoolClass {
  id: string;
  displayName: string;
  streams: Stream[];
}
interface SchoolDirectoryEntry {
  id: string;
  name: string;
  classes: SchoolClass[];
}
interface Learner {
  enrollmentId: string;
  studentId: string;
  systemId: string | null;
  name: string;
}
interface SavedMark {
  result: CompetencyResult | null;
  percentage: number | null;
}

const RESULT_STYLE: Record<CompetencyResult, { active: string; text: string }> = {
  completed: { active: 'bg-[#1A7A4A] border-[#1A7A4A] text-white', text: 'text-[#1A7A4A]' },
  incomplete: { active: 'bg-[#B86E00] border-[#B86E00] text-white', text: 'text-[#9A5B00]' },
  absent: { active: 'bg-[#5F6472] border-[#5F6472] text-white', text: 'text-text-secondary' },
};

/**
 * The Competency Examination scoring screen.
 *
 * Pick a class (and stream), then tap one result per learner: Completed
 * (100%), Not completed (70%) or Absent (0%). Marks already saved for this
 * exam — by this teacher or another one — are shown pre-selected, so a
 * second examiner sees what is done and a mistake can be corrected by tapping
 * the right result and saving again (enter-marks overwrites by default).
 *
 * Taps are held on the page until "Save marks". That keeps the screen usable
 * on a weak connection in the exam room, and a warning stops the teacher
 * leaving with marks unsaved.
 */
export function CompetencyExamPanel({ systemId }: { systemId: string }) {
  const { user } = useAuth();
  const toast = useToast();

  const [examName, setExamName] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [examError, setExamError] = useState('');
  const [school, setSchool] = useState<SchoolDirectoryEntry | null>(null);
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [roster, setRoster] = useState<Learner[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [known, setKnown] = useState<Record<string, Learner>>({});
  const [saved, setSaved] = useState<Record<string, SavedMark>>({});
  const [draft, setDraft] = useState<Record<string, CompetencyResult>>({});
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/staff/competency-exams/${systemId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setExamName(d.data.skill);
          setInstructions(d.data.instructions ?? '');
        }
        else setExamError(d.message ?? 'Could not open this exam.');
      })
      .catch(() => setExamError('Network error. Check your connection and reload.'));
  }, [systemId]);

  useEffect(() => {
    if (!user?.schoolId) return;
    fetch('/api/directory/schools')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setSchool((d.data as SchoolDirectoryEntry[]).find((s) => s.id === user.schoolId) ?? null);
      })
      .catch(() => toast.error('Network error while loading your classes.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.schoolId]);

  // Marks already on file for this exam, from any teacher. A failed read is
  // non-fatal: the page still records marks, it just can't pre-select them.
  const loadSaved = useCallback(() => {
    fetch(`/api/admin/assessments/${systemId}/results`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) return;
        const next: Record<string, SavedMark> = {};
        for (const r of data.data.results as {
          studentId: string;
          totalScore: number | null;
          maxScore: number | null;
          percentage: number | null;
        }[]) {
          next[r.studentId] = { result: competencyResultFromScore(r.totalScore, r.maxScore), percentage: r.percentage };
        }
        setSaved(next);
      })
      .catch(() => {});
  }, [systemId]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const selectedClass = school?.classes.find((c) => c.id === classId);

  async function loadRoster() {
    if (!classId) return;
    setLoadingRoster(true);
    try {
      const qs = streamId ? `?streamId=${streamId}` : '';
      const res = await fetch(`/api/directory/classes/${classId}/roster${qs}`);
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message ?? 'Could not load the class list.');
        return;
      }
      const learners = (data.data as Learner[])
        .map((l) => ({ enrollmentId: l.enrollmentId, studentId: l.studentId, systemId: l.systemId, name: l.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setRoster(learners);
      setRosterLoaded(true);
      setKnown((cur) => {
        const next = { ...cur };
        for (const l of learners) next[l.studentId] = l;
        return next;
      });
      loadSaved();
    } catch {
      toast.error('Network error while loading the class list.');
    } finally {
      setLoadingRoster(false);
    }
  }

  const shown = (studentId: string): CompetencyResult | null => draft[studentId] ?? saved[studentId]?.result ?? null;

  const changes = useMemo(
    () => Object.entries(draft).filter(([id, r]) => saved[id]?.result !== r && known[id]),
    [draft, saved, known]
  );

  useEffect(() => {
    if (changes.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length]);

  const tally = useMemo(() => {
    const t = { completed: 0, incomplete: 0, absent: 0, unmarked: 0 };
    for (const l of roster) {
      const r = draft[l.studentId] ?? saved[l.studentId]?.result ?? null;
      if (r) t[r] += 1;
      else t.unmarked += 1;
    }
    return t;
  }, [roster, draft, saved]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((l) => l.name.toLowerCase().includes(q) || (l.systemId ?? '').toLowerCase().includes(q));
  }, [roster, query]);

  function pick(studentId: string, result: CompetencyResult) {
    setDraft((cur) => ({ ...cur, [studentId]: result }));
  }

  function markUnmarkedAbsent() {
    setDraft((cur) => {
      const next = { ...cur };
      for (const l of roster) {
        if (!next[l.studentId] && !saved[l.studentId]?.result) next[l.studentId] = 'absent';
      }
      return next;
    });
  }

  async function save() {
    if (changes.length === 0) {
      toast.error('Nothing new to save. Tap a result for at least one learner.');
      return;
    }
    const entries = changes.map(([studentId, result]) => ({
      studentId,
      enrollmentId: known[studentId].enrollmentId,
      score: competencyScore(result),
    }));
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/assessments/${systemId}/enter-marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxScore: COMPETENCY_MAX_SCORE, entries }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message ?? 'Marks were not saved. Try again.');
        return;
      }
      toast.success(`Saved marks for ${entries.length} learner${entries.length === 1 ? '' : 's'}.`);
      setSaved((cur) => {
        const next = { ...cur };
        for (const [id, r] of changes) next[id] = { result: r, percentage: competencyScore(r) };
        return next;
      });
      setDraft({});
    } catch {
      toast.error('Network error. Your taps are still on screen; save again when you are back online.');
    } finally {
      setSaving(false);
    }
  }

  if (examError) {
    return (
      <div className="max-w-3xl">
        <Link href="/staff/competency" className="text-sm text-text-muted hover:text-primary-700">
          ← Competency Examination
        </Link>
        <p className="text-error mt-4">{examError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4 pb-4">
      <div>
        <Link href="/staff/competency" className="text-sm text-text-muted hover:text-primary-700">
          ← Competency Examination
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-faint mt-3">Competency skill being checked</p>
        <h1 className="text-2xl font-bold text-primary-900 mt-0.5 mb-1">{examName ?? 'Loading…'}</h1>
        <p className="text-sm text-text-muted">
          Completed and saved the work: 100%. Attempted but not completed: 70%. Absent: 0%.
        </p>
      </div>

      {instructions && (
        <Card className="p-4">
          <p className="text-xs font-medium text-text-muted tracking-wide mb-1">TASK</p>
          <p className="text-sm text-text-primary whitespace-pre-line">{instructions}</p>
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <p className="text-xs font-medium text-text-muted tracking-wide">CHOOSE A CLASS</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            aria-label="Class"
            options={[
              { value: '', label: school ? 'Select a class…' : 'Loading classes…' },
              ...(school?.classes ?? []).map((c) => ({ value: c.id, label: c.displayName })),
            ]}
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStreamId('');
            }}
            disabled={!school}
          />
          <Select
            aria-label="Stream"
            options={[
              { value: '', label: selectedClass && selectedClass.streams.length > 0 ? 'All streams' : 'No streams' },
              ...(selectedClass?.streams ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            disabled={!selectedClass || selectedClass.streams.length === 0}
          />
        </div>
        <Button variant="outline" onClick={() => void loadRoster()} disabled={!classId} isLoading={loadingRoster}>
          Open class list
        </Button>
      </Card>

      {rosterLoaded && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Tally label="Completed" value={tally.completed} className="text-[#1A7A4A]" />
              <Tally label="Not completed" value={tally.incomplete} className="text-[#9A5B00]" />
              <Tally label="Absent" value={tally.absent} className="text-text-secondary" />
              <Tally label="Not marked" value={tally.unmarked} className="text-primary-900" />
            </div>
            <div className="relative">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a learner by name or ID"
                aria-label="Find a learner"
                className="w-full h-10 rounded-lg border border-border-strong bg-bg-card pl-9 pr-3 text-sm focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/15"
              />
            </div>
          </div>

          {roster.length === 0 ? (
            <p className="p-5 text-sm text-text-muted">No learners are enrolled in this class.</p>
          ) : visible.length === 0 ? (
            <p className="p-5 text-sm text-text-muted">No learner matches that search.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((l) => {
                const current = shown(l.studentId);
                const isSaved = !!saved[l.studentId]?.result && saved[l.studentId].result === current;
                const other = saved[l.studentId] && !saved[l.studentId].result ? saved[l.studentId].percentage : null;
                return (
                  <li key={l.studentId} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-primary-900 break-words">{l.name}</p>
                      <p className="text-xs text-text-muted">
                        {l.systemId ?? '—'}
                        {isSaved && (
                          <span className="inline-flex items-center gap-1 ml-2 text-[#1A7A4A]">
                            <Check className="w-3 h-3" aria-hidden /> Saved
                          </span>
                        )}
                        {current && !isSaved && <span className="ml-2 text-[#9A5B00]">Not saved yet</span>}
                        {other !== null && !current && <span className="ml-2">Has another mark: {other}%</span>}
                      </p>
                    </div>
                    <div
                      className="grid grid-cols-3 gap-1.5 sm:flex sm:shrink-0"
                      role="radiogroup"
                      aria-label={`Result for ${l.name}`}
                    >
                      {COMPETENCY_RESULTS.map((r) => {
                        const active = current === r.code;
                        return (
                          <button
                            key={r.code}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => pick(l.studentId, r.code)}
                            className={`min-h-10 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                              active
                                ? RESULT_STYLE[r.code].active
                                : 'border-border-strong text-text-secondary hover:bg-bg-muted'
                            }`}
                          >
                            {r.label}
                            <span className="ml-1 font-normal opacity-80 tabular-nums">{r.score}%</span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {tally.unmarked > 0 && roster.length > 0 && (
            <div className="p-4 border-t border-border">
              <button
                type="button"
                onClick={markUnmarkedAbsent}
                className="w-full py-2.5 rounded-lg border border-border-strong text-sm font-semibold text-text-primary hover:bg-bg-muted"
              >
                Mark the {tally.unmarked} not yet marked as Absent
              </button>
            </div>
          )}
        </Card>
      )}

      {(rosterLoaded || changes.length > 0) && (
        <div className="sticky bottom-0 z-10 -mx-1 px-1 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="rounded-xl border border-border bg-bg-card shadow-lg p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">
              {changes.length === 0
                ? 'All marks on this list are saved.'
                : `${changes.length} mark${changes.length === 1 ? '' : 's'} not saved yet`}
            </p>
            <Button onClick={() => void save()} isLoading={saving} disabled={changes.length === 0}>
              Save marks
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tally({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div>
      <p className={`text-xl font-bold tabular-nums ${className}`}>{value}</p>
      <p className="text-[11px] text-text-muted leading-tight">{label}</p>
    </div>
  );
}
