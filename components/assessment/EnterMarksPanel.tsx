'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { Search, X } from 'lucide-react';

interface AssessmentSummary {
  id: string;
  systemId: string;
  title: string;
}

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

interface PickedStudent {
  enrollmentId: string;
  studentId: string;
  systemId: string | null;
  name: string;
  schoolName: string | null;
  className: string | null;
  streamName: string | null;
}

// Same three bands and the same 100/50/0 conversion the lab practical-
// observation rubric already uses (lib/entities/practical-observations.ts,
// BAND_SCORE) — duplicated here rather than imported, since that module
// pulls in server-only Supabase code a client component can't bundle.
// Kept in sync deliberately: one established banding language across the
// app, not a second one that happens to mean something slightly different.
const BEHAVIOR_BANDS = [
  { code: 'outstanding', label: 'Outstanding' },
  { code: 'moderate', label: 'Moderate' },
  { code: 'needs_support', label: 'Needs support' },
] as const;
type BehaviorBand = (typeof BEHAVIOR_BANDS)[number]['code'];
const BAND_SCORE: Record<BehaviorBand, number> = { outstanding: 100, moderate: 50, needs_support: 0 };

type ScoreMode = 'band' | 'number';

/**
 * Stop-gap for a class with no marks yet: build a list of learners — a
 * whole class/stream roster, individual students picked by search, or both
 * mixed together — then rate or score each one, save. Two input modes:
 * band ratings (Outstanding/Moderate/Needs support, tap-to-pick, no typing
 * — for "how has this learner been", converted to a score with the same
 * 100/50/0 the lab practical rubric uses) or a raw number (for a paper or
 * oral test that already has one). Either way this skips the whole "create
 * questions, students sit it online" flow — the scores land as normal
 * marked assessment_submissions rows, so they count as "written" everywhere
 * marks already do (the attendance blend, leaderboards, exports) without
 * either system needing to know this assessment was never sat online.
 *
 * Shared between the admin and staff portals — the underlying API
 * (/api/admin/assessments/[id]/enter-marks) already accepts both roles, but
 * each portal has its own layout gate, so this can't live under /admin
 * alone. `backHref` lets each page point back to its own assessment detail
 * route.
 *
 * Also the scoring screen behind the standalone "Behaviour Rating" form
 * (/staff/behaviour) — that flow resolves its own backing assessment
 * invisibly (see getOrCreateBehaviorAssessment) and passes `fixedSchoolId`
 * so a teacher only ever picks a class/stream, never a school, and
 * `lockToBandMode` so the number-entry toggle (meaningless for a rating)
 * never appears.
 */
export function EnterMarksPanel({
  assessmentSystemId,
  backHref,
  backLabel = 'Back to assessment',
  heading = 'Enter marks directly',
  fixedSchoolId,
  lockToBandMode = false,
}: {
  assessmentSystemId: string;
  backHref: string;
  backLabel?: string;
  heading?: string;
  fixedSchoolId?: string;
  lockToBandMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [assessment, setAssessment] = useState<AssessmentSummary | null>(null);
  const [schools, setSchools] = useState<SchoolDirectoryEntry[]>([]);
  const [schoolId, setSchoolId] = useState(fixedSchoolId ?? '');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);

  // Band mode is the default — rating a learner's behaviour ("how have they
  // been"), same interaction as the lab practical rubric: tap a band, no
  // typing, no pre-selected default. Number mode is still here for a case
  // that genuinely has a raw score already (e.g. an oral test out of 20).
  const [mode, setMode] = useState<ScoreMode>('band');

  const [picked, setPicked] = useState<PickedStudent[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [bands, setBands] = useState<Record<string, BehaviorBand>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PickedStudent[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/assessments/${assessmentSystemId}`);
        const data = await res.json();
        if (data.success) setAssessment(data.data);
        else toast.error(data.message ?? 'Failed to load assessment.');
      } catch {
        toast.error('Network error while loading assessment.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentSystemId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/directory/schools');
        const data = await res.json();
        if (data.success) setSchools(data.data);
      } catch {
        toast.error('Network error while loading schools.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSchool = schools.find((s) => s.id === schoolId);
  const selectedClass = selectedSchool?.classes.find((c) => c.id === classId);
  const selectedStream = selectedClass?.streams.find((s) => s.id === streamId);

  function addStudents(students: PickedStudent[]) {
    setPicked((current) => {
      const existingIds = new Set(current.map((p) => p.studentId));
      const toAdd = students.filter((s) => !existingIds.has(s.studentId));
      return [...current, ...toAdd];
    });
  }

  function removeStudent(studentId: string) {
    setPicked((current) => current.filter((p) => p.studentId !== studentId));
    setScores((current) => {
      const next = { ...current };
      delete next[studentId];
      return next;
    });
    setBands((current) => {
      const next = { ...current };
      delete next[studentId];
      return next;
    });
  }

  function markRemainingModerate() {
    const remaining = picked.filter((p) => !bands[p.studentId]);
    if (remaining.length === 0) return;
    setBands((current) => {
      const next = { ...current };
      for (const p of remaining) next[p.studentId] = 'moderate';
      return next;
    });
  }

  async function loadRoster() {
    if (!classId) return;
    setLoadingRoster(true);
    try {
      const qs = streamId ? `?streamId=${streamId}` : '';
      const res = await fetch(`/api/directory/classes/${classId}/roster${qs}`);
      const data = await res.json();
      if (data.success) {
        addStudents(
          data.data.map((r: { enrollmentId: string; studentId: string; systemId: string | null; name: string }) => ({
            ...r,
            schoolName: selectedSchool?.name ?? null,
            className: selectedClass?.displayName ?? null,
            streamName: selectedStream?.name ?? null,
          }))
        );
        toast.success(`Added ${data.data.length} learner(s) from the roster.`);
      } else {
        toast.error(data.message ?? 'Failed to load the roster.');
      }
    } catch {
      toast.error('Network error while loading the roster.');
    } finally {
      setLoadingRoster(false);
    }
  }

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/directory/students/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) setSearchResults(data.data);
    } catch {
      // Silent — search is a convenience; the picked list and roster still work.
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void runSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, runSearch]);

  // Band mode is always out of 100 (the fixed 100/50/0 conversion) — the
  // maxScore field only applies to number mode, where the teacher's own
  // scale (e.g. an oral test out of 20) needs one.
  const effectiveMaxScore = mode === 'band' ? 100 : maxScore;

  const entries = useMemo(() => {
    if (mode === 'band') {
      return picked
        .filter((p) => bands[p.studentId])
        .map((p) => ({ ...p, score: String(BAND_SCORE[bands[p.studentId]]) }));
    }
    return picked
      .map((p) => ({ ...p, score: scores[p.studentId] }))
      .filter((p): p is PickedStudent & { score: string } => p.score !== undefined && p.score.trim() !== '');
  }, [picked, scores, bands, mode]);

  async function handleSave() {
    if (entries.length === 0) {
      toast.error(mode === 'band' ? 'Rate at least one learner.' : 'Enter at least one score.');
      return;
    }
    const parsed = entries.map((e) => ({
      studentId: e.studentId,
      enrollmentId: e.enrollmentId,
      score: Number(e.score),
    }));
    if (parsed.some((e) => Number.isNaN(e.score) || e.score < 0 || e.score > effectiveMaxScore)) {
      toast.error(`Every score must be a number between 0 and ${effectiveMaxScore}.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/assessments/${assessmentSystemId}/enter-marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxScore: effectiveMaxScore, entries: parsed }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message ?? 'Marks recorded.');
        setScores({});
        setBands({});
      } else {
        toast.error(data.message ?? 'Failed to enter marks.');
      }
    } catch {
      toast.error('Network error while saving marks.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">{heading}</h1>
        <p className="text-sm text-text-muted">
          {lockToBandMode
            ? 'Pick a class or stream below, then rate each learner — no online sitting, no separate form to fill.'
            : `${assessment ? `For "${assessment.title}"` : 'Loading…'} — a stop-gap for learners with no online sitting. Rate or score each learner below; it counts as this assessment’s marks, same as a normal marked submission.`}
        </p>
      </div>

      <Card className="space-y-4">
        {!lockToBandMode && (
          <div>
            <p className="text-xs font-medium text-text-muted tracking-wide mb-2">HOW ARE YOU SCORING</p>
            <div className="inline-flex rounded-lg border border-border-strong p-0.5">
              <button
                type="button"
                onClick={() => setMode('band')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'band' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'}`}
              >
                Rate behaviour
              </button>
              <button
                type="button"
                onClick={() => setMode('number')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'number' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'}`}
              >
                Type a number
              </button>
            </div>
            <p className="text-xs text-text-muted mt-2">
              {mode === 'band'
                ? 'Pick a band per learner — Outstanding, Moderate, or Needs support — converted to a score out of 100 (100 / 50 / 0), same convention as the lab practical rubric.'
                : 'For a paper or oral test you already have a raw score for.'}
            </p>
          </div>
        )}

        {mode === 'number' && (
          <Input
            label="Max score"
            type="number"
            min={1}
            value={maxScore}
            onChange={(e) => setMaxScore(Number(e.target.value))}
          />
        )}

        <div>
          <p className="text-xs font-medium text-text-muted tracking-wide mb-2">ADD A WHOLE CLASS / STREAM</p>
          <div className={`grid grid-cols-1 gap-3 ${fixedSchoolId ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {!fixedSchoolId && (
              <Select
                options={[{ value: '', label: 'Select a school…' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]}
                value={schoolId}
                onChange={(e) => {
                  setSchoolId(e.target.value);
                  setClassId('');
                  setStreamId('');
                }}
              />
            )}
            <Select
              options={[
                { value: '', label: 'Select a class…' },
                ...(selectedSchool?.classes ?? []).map((c) => ({ value: c.id, label: c.displayName })),
              ]}
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setStreamId('');
              }}
              disabled={!schoolId}
            />
            <Select
              options={[
                { value: '', label: selectedClass && selectedClass.streams.length > 0 ? 'All streams' : 'Not applicable' },
                ...(selectedClass?.streams ?? []).map((s) => ({ value: s.id, label: s.name })),
              ]}
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
              disabled={!selectedClass || selectedClass.streams.length === 0}
            />
          </div>
          <Button variant="outline" className="mt-3" onClick={() => void loadRoster()} disabled={!classId || loadingRoster}>
            {loadingRoster ? 'Loading…' : 'Add roster to list'}
          </Button>
        </div>

        <div className="pt-3 border-t border-border">
          <p className="text-xs font-medium text-text-muted tracking-wide mb-2">
            ADD AN INDIVIDUAL — any class, any school, e.g. a transfer student
          </p>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or student ID…"
              aria-label="Search students"
              className="w-full h-10 rounded-lg border border-border-strong bg-bg-card pl-9 pr-3 text-sm focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/15"
            />
          </div>
          {searching && <p className="text-xs text-text-muted mt-2">Searching…</p>}
          {!searching && searchQuery.trim().length >= 2 && (
            <div className="mt-2 border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="text-sm text-text-muted p-3">No matching learners.</p>
              ) : (
                searchResults.map((r) => (
                  <button
                    key={r.studentId}
                    type="button"
                    onClick={() => {
                      addStudents([r]);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg-subtle flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-primary-900">{r.name}</span>{' '}
                      <span className="text-text-muted">{r.systemId ?? '—'}</span>
                    </span>
                    <span className="text-xs text-text-muted shrink-0">
                      {[r.schoolName, r.className, r.streamName].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        {picked.length === 0 ? (
          <p className="text-sm text-text-muted">
            No learners on the list yet — add a roster above, or search for individuals.
          </p>
        ) : (
          <div className="space-y-2">
            {picked.map((p) => (
              <div key={p.studentId} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#FAFAFA] last:border-0">
                <div className="min-w-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => removeStudent(p.studentId)}
                    aria-label={`Remove ${p.name}`}
                    className="text-text-muted hover:text-error shrink-0"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary-900 truncate">{p.name}</p>
                    <p className="text-xs text-text-muted truncate">
                      {p.systemId ?? '—'}
                      {(p.className || p.streamName) && ` · ${[p.className, p.streamName].filter(Boolean).join(' ')}`}
                    </p>
                  </div>
                </div>
                {mode === 'band' ? (
                  <div className="flex gap-1 shrink-0" role="radiogroup" aria-label={`Band for ${p.name}`}>
                    {BEHAVIOR_BANDS.map((band) => {
                      const active = bands[p.studentId] === band.code;
                      return (
                        <button
                          key={band.code}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setBands((cur) => ({ ...cur, [p.studentId]: band.code }))}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-primary-700 text-white border-primary-700'
                              : 'border-border-strong text-text-secondary hover:bg-bg-muted'
                          }`}
                        >
                          {band.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={maxScore}
                    placeholder={`0-${maxScore}`}
                    value={scores[p.studentId] ?? ''}
                    onChange={(e) => setScores((cur) => ({ ...cur, [p.studentId]: e.target.value }))}
                    className="w-24 rounded-lg border border-border-strong px-2.5 py-1.5 text-sm text-right focus:border-primary-700 focus:outline-none shrink-0"
                    aria-label={`Score for ${p.name}`}
                  />
                )}
              </div>
            ))}

            {mode === 'band' && picked.some((p) => !bands[p.studentId]) && (
              <button
                type="button"
                onClick={markRemainingModerate}
                className="text-xs text-primary-700 hover:underline"
              >
                Mark the remaining {picked.filter((p) => !bands[p.studentId]).length} as Moderate
              </button>
            )}

            <div className="pt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                {entries.length} of {picked.length} learner{picked.length === 1 ? '' : 's'} rated.
              </p>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => router.push(backHref)}>
                  {backLabel}
                </Button>
                <Button onClick={() => void handleSave()} isLoading={saving}>
                  Save marks
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
