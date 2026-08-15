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

/**
 * Stop-gap for a class with no marks yet: build a list of learners — a
 * whole class/stream roster, individual students picked by search, or both
 * mixed together — type a score per learner, save. Skips the whole "create
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
 */
export function EnterMarksPanel({ assessmentSystemId, backHref }: { assessmentSystemId: string; backHref: string }) {
  const router = useRouter();
  const toast = useToast();

  const [assessment, setAssessment] = useState<AssessmentSummary | null>(null);
  const [schools, setSchools] = useState<SchoolDirectoryEntry[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);

  const [picked, setPicked] = useState<PickedStudent[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});

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

  const entries = useMemo(
    () =>
      picked
        .map((p) => ({ ...p, score: scores[p.studentId] }))
        .filter((p): p is PickedStudent & { score: string } => p.score !== undefined && p.score.trim() !== ''),
    [picked, scores]
  );

  async function handleSave() {
    if (entries.length === 0) {
      toast.error('Enter at least one score.');
      return;
    }
    const parsed = entries.map((e) => ({
      studentId: e.studentId,
      enrollmentId: e.enrollmentId,
      score: Number(e.score),
    }));
    if (parsed.some((e) => Number.isNaN(e.score) || e.score < 0 || e.score > maxScore)) {
      toast.error(`Every score must be a number between 0 and ${maxScore}.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/assessments/${assessmentSystemId}/enter-marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxScore, entries: parsed }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message ?? 'Marks recorded.');
        setScores({});
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
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Enter marks directly</h1>
        <p className="text-sm text-text-muted">
          {assessment ? `For "${assessment.title}"` : 'Loading assessment…'} — a stop-gap for
          learners with no online sitting. Scores here count as this assessment&rsquo;s marks, same
          as a normal marked submission.
        </p>
      </div>

      <Card className="space-y-4">
        <Input
          label="Max score"
          type="number"
          min={1}
          value={maxScore}
          onChange={(e) => setMaxScore(Number(e.target.value))}
        />

        <div>
          <p className="text-xs font-medium text-text-muted tracking-wide mb-2">ADD A WHOLE CLASS / STREAM</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              options={[{ value: '', label: 'Select a school…' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]}
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setClassId('');
                setStreamId('');
              }}
            />
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
              </div>
            ))}

            <div className="pt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                {entries.length} of {picked.length} learner{picked.length === 1 ? '' : 's'} have a score entered.
              </p>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => router.push(backHref)}>
                  Back to assessment
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
