'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { Trash2, UserPlus } from 'lucide-react';

interface AssessmentTarget {
  id: string;
  schoolId: string | null;
  level: number | null;
  classId: string | null;
  studentId: string | null;
}

interface SetupAssessment {
  id: string;
  systemId: string;
  title: string;
  description: string;
  timeLimit: number;
  opensAt?: string;
  closesAt?: string;
  instructions: string;
  targets: AssessmentTarget[];
  capabilities: { isOwner: boolean };
}

interface Collaborator {
  id: string;
  name: string;
  systemId: string | null;
}

interface School {
  id: string;
  name: string;
}

interface GradeLevel {
  level: number;
  code: string;
}

/** ISO timestamp → local `datetime-local` input value ("" when unset). */
function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface AssessmentSetupPanelProps {
  systemId: string;
  apiBase: string;
  /** Refreshes the parent header (title/dates/targets) after any save here. */
  onSaved?: () => void;
}

/**
 * Details, Collaborators, and Audience editing — the authoring-time half of
 * the assessment detail page, split out from AssessmentAnalytics (the
 * reporting half) so the two can be built, tested, and reasoned about
 * separately. Question authoring lives on its own page rather than here —
 * see the Questions link in AssessmentAnalytics' header.
 *
 * Fetches its own copy of the assessment rather than receiving it as a
 * prop: this mirrors how the original monolith page already made several
 * independent requests per section, and keeps this component fully
 * self-contained instead of threading a large prop surface through the
 * parent for a form only rendered on the Setup tab.
 */
export function AssessmentSetupPanel({ systemId, apiBase, onSaved }: AssessmentSetupPanelProps) {
  const toast = useToast();

  const [assessment, setAssessment] = useState<SetupAssessment | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [levels, setLevels] = useState<GradeLevel[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorIdentifier, setCollaboratorIdentifier] = useState('');
  const [addingCollaborator, setAddingCollaborator] = useState(false);
  const [studentIdentifier, setStudentIdentifier] = useState('');
  const [addingStudentTarget, setAddingStudentTarget] = useState(false);
  const [pendingTargetSchool, setPendingTargetSchool] = useState('');
  const [pendingTargetLevel, setPendingTargetLevel] = useState('');
  const [addingTarget, setAddingTarget] = useState(false);
  const [studentTargetNames, setStudentTargetNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaTimeLimit, setMetaTimeLimit] = useState(0);
  const [metaOpensAt, setMetaOpensAt] = useState('');
  const [metaClosesAt, setMetaClosesAt] = useState('');

  const load = useCallback(async () => {
    try {
      const [detail, schoolsRes, levelsRes, collaboratorsRes] = await Promise.all([
        fetch(`${apiBase}/${systemId}`).then((r) => r.json()),
        fetch('/api/admin/system/schools').then((r) => r.json()),
        fetch('/api/admin/system/grade-levels').then((r) => r.json()),
        fetch(`${apiBase}/${systemId}/collaborators`).then((r) => r.json()),
      ]);

      if (detail.success) {
        setAssessment(detail.data);
        setInstructions(detail.data.instructions ?? '');
        setMetaTitle(detail.data.title ?? '');
        setMetaDescription(detail.data.description ?? '');
        setMetaTimeLimit(detail.data.timeLimit ?? 0);
        setMetaOpensAt(toLocalInput(detail.data.opensAt));
        setMetaClosesAt(toLocalInput(detail.data.closesAt));

        const studentIds: string[] = (detail.data.targets ?? [])
          .map((t: AssessmentTarget) => t.studentId)
          .filter((id: string | null): id is string => id !== null);
        if (studentIds.length > 0) {
          const namesRes = await fetch(
            `/api/admin/assessments/students?ids=${studentIds.join(',')}`
          ).then((r) => r.json());
          if (namesRes.success) {
            setStudentTargetNames(
              Object.fromEntries(
                namesRes.data.map((s: { id: string; name: string; systemId: string }) => [
                  s.id,
                  `${s.name} · ${s.systemId}`,
                ])
              )
            );
          }
        }
      } else {
        toast.error(detail.message ?? 'Failed to load assessment.');
      }
      if (schoolsRes.success) setSchools(schoolsRes.data);
      if (levelsRes.success) setLevels(levelsRes.data);
      if (collaboratorsRes.success) setCollaborators(collaboratorsRes.data);
    } catch {
      toast.error('Network error while loading the assessment.');
    } finally {
      setLoading(false);
    }
  }, [apiBase, systemId, toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function patchAssessment(patch: Record<string, unknown>, message: string) {
    const res = await fetch(`${apiBase}/${systemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(message);
      await load();
      onSaved?.();
    } else {
      toast.error(data.message ?? 'Update failed.');
    }
  }

  async function saveDetails() {
    await patchAssessment(
      {
        title: metaTitle,
        description: metaDescription,
        timeLimit: metaTimeLimit,
        opensAt: metaOpensAt ? new Date(metaOpensAt).toISOString() : null,
        closesAt: metaClosesAt ? new Date(metaClosesAt).toISOString() : null,
      },
      'Details saved.'
    );
  }

  async function addTarget(target: { schoolId?: string; level?: number; studentId?: string }) {
    if (!assessment) return;
    const next = [
      ...assessment.targets.map((t) => ({
        schoolId: t.schoolId,
        level: t.level,
        classId: t.classId,
        studentId: t.studentId,
      })),
      {
        schoolId: target.schoolId ?? null,
        level: target.level ?? null,
        classId: null,
        studentId: target.studentId ?? null,
      },
    ];
    await patchAssessment({ targets: next }, 'Audience updated.');
  }

  async function removeTarget(targetId: string) {
    if (!assessment) return;
    const next = assessment.targets
      .filter((t) => t.id !== targetId)
      .map((t) => ({ schoolId: t.schoolId, level: t.level, classId: t.classId, studentId: t.studentId }));
    await patchAssessment({ targets: next }, 'Audience updated.');
  }

  async function addSchoolLevelTarget() {
    if (!pendingTargetSchool && !pendingTargetLevel) return;
    setAddingTarget(true);
    try {
      await addTarget({
        schoolId: pendingTargetSchool || undefined,
        level: pendingTargetLevel ? Number(pendingTargetLevel) : undefined,
      });
      setPendingTargetSchool('');
      setPendingTargetLevel('');
    } finally {
      setAddingTarget(false);
    }
  }

  async function addStudentTarget() {
    const identifier = studentIdentifier.trim();
    if (!identifier) return;
    setAddingStudentTarget(true);
    try {
      const res = await fetch(
        `/api/admin/assessments/students?identifier=${encodeURIComponent(identifier)}`
      );
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message ?? 'Student not found.');
        return;
      }
      setStudentTargetNames((prev) => ({
        ...prev,
        [data.data.id]: `${data.data.name} · ${data.data.systemId}`,
      }));
      await addTarget({ studentId: data.data.id });
      setStudentIdentifier('');
    } catch {
      toast.error('Network error.');
    } finally {
      setAddingStudentTarget(false);
    }
  }

  async function addCollaborator(e: React.FormEvent) {
    e.preventDefault();
    if (!collaboratorIdentifier.trim()) return;
    setAddingCollaborator(true);
    try {
      const res = await fetch(`${apiBase}/${systemId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: collaboratorIdentifier.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCollaborators(data.data);
        setCollaboratorIdentifier('');
        toast.success('Collaborator added.');
      } else {
        toast.error(data.message ?? 'Could not add that collaborator.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setAddingCollaborator(false);
    }
  }

  async function removeCollaborator(staffId: string) {
    const res = await fetch(`${apiBase}/${systemId}/collaborators/${staffId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setCollaborators(data.data);
      toast.success('Collaborator removed.');
    } else {
      toast.error(data.message ?? 'Could not remove that collaborator.');
    }
  }

  if (loading) return <p className="text-text-muted">Loading…</p>;
  if (!assessment) return <p className="text-error">Assessment not found.</p>;

  const isOwner = assessment.capabilities.isOwner;

  const targetLabel = (t: AssessmentTarget) => {
    if (t.studentId) return studentTargetNames[t.studentId] ?? 'Student';
    const parts = [
      t.schoolId ? (schools.find((s) => s.id === t.schoolId)?.name ?? 'Unknown school') : null,
      t.level !== null ? (levels.find((l) => l.level === t.level)?.code ?? `Level ${t.level}`) : null,
    ].filter(Boolean);
    return parts.join(' · ');
  };

  return (
    <div className="space-y-4">
      {/* ── Details ──────────────────────────────────────────── */}
      <Card>
        <h2 className="font-semibold text-primary-900 mb-1">Details</h2>
        <p className="text-xs text-text-muted mb-3">
          Fix anything mis-entered when this assessment was created.
        </p>
        <div className="space-y-4">
          <Input label="Title" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} required />
          <Input
            label="Description"
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Time limit (minutes)"
              type="number"
              min={1}
              value={metaTimeLimit}
              onChange={(e) => setMetaTimeLimit(Number(e.target.value))}
              required
            />
            <Input
              label="Opens at (optional)"
              type="datetime-local"
              value={metaOpensAt}
              onChange={(e) => setMetaOpensAt(e.target.value)}
            />
            <Input
              label="Closes at (optional)"
              type="datetime-local"
              value={metaClosesAt}
              onChange={(e) => setMetaClosesAt(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button
            variant="outline"
            onClick={() => void saveDetails()}
            disabled={!metaTitle.trim() || metaTimeLimit < 1}
          >
            Save details
          </Button>
        </div>
      </Card>

      {/* ── Collaborators ────────────────────────────────────── */}
      <Card>
        <h2 className="font-semibold text-primary-900 mb-1">Collaborators</h2>
        <p className="text-xs text-text-muted mb-3">
          {isOwner
            ? 'Give a teacher access to add/edit questions and mark this assessment, without making them its owner.'
            : 'Teachers with access to add/edit questions and mark this assessment, alongside its creator.'}
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {collaborators.length === 0 ? (
            <span className="text-sm text-text-muted">No collaborators yet.</span>
          ) : (
            collaborators.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-lg bg-[#FAFAFA] px-2 py-1 text-xs text-[#12333F]"
              >
                {c.name}
                {c.systemId ? ` · ${c.systemId}` : ''}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => void removeCollaborator(c.id)}
                    aria-label={`Remove ${c.name}`}
                    className="text-[#666666] hover:text-[#C26565]"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden />
                  </button>
                )}
              </span>
            ))
          )}
        </div>

        {isOwner && (
          <form onSubmit={addCollaborator} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <Input
                label="Add teacher (System ID or email)"
                value={collaboratorIdentifier}
                onChange={(e) => setCollaboratorIdentifier(e.target.value)}
                placeholder="e.g. TSF-2026-0004"
              />
            </div>
            <Button type="submit" variant="outline" isLoading={addingCollaborator}>
              <UserPlus className="w-4 h-4 mr-1.5" aria-hidden />
              Add
            </Button>
          </form>
        )}
      </Card>

      {/* ── Audience ─────────────────────────────────────────── */}
      <Card>
        <h2 className="font-semibold text-primary-900 mb-1">Audience</h2>
        <p className="text-xs text-text-muted mb-3">
          With no targets, every student may sit this. Add a target to narrow it by school, grade
          level, or both together — a student matching any one target row qualifies, and picking
          a school and a level before clicking &ldquo;Add target&rdquo; requires both on that row.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {assessment.targets.length === 0 ? (
            <Badge variant="accent">All students</Badge>
          ) : (
            assessment.targets.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-lg bg-[#FAFAFA] px-2 py-1 text-xs text-[#12333F]"
              >
                {targetLabel(t)}
                <button
                  type="button"
                  onClick={() => void removeTarget(t.id)}
                  aria-label={`Remove target ${targetLabel(t)}`}
                  className="text-[#666666] hover:text-[#C26565]"
                >
                  <Trash2 className="w-3 h-3" aria-hidden />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select
            label="School (optional)"
            options={[
              { value: '', label: 'Any school' },
              ...schools.map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={pendingTargetSchool}
            onChange={(e) => setPendingTargetSchool(e.target.value)}
          />
          <Select
            label="Grade level (optional)"
            options={[
              { value: '', label: 'Any level' },
              ...levels.map((l) => ({ value: String(l.level), label: l.code })),
            ]}
            value={pendingTargetLevel}
            onChange={(e) => setPendingTargetLevel(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          disabled={!pendingTargetSchool && !pendingTargetLevel}
          isLoading={addingTarget}
          onClick={() => void addSchoolLevelTarget()}
        >
          Add target
        </Button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addStudentTarget();
          }}
          className="mt-2 flex flex-wrap items-end gap-2"
        >
          <div className="flex-1 min-w-[220px]">
            <Input
              label="Add: specific student (System ID or email)"
              value={studentIdentifier}
              onChange={(e) => setStudentIdentifier(e.target.value)}
              placeholder="e.g. TST-2026-0004"
            />
          </div>
          <Button type="submit" variant="outline" isLoading={addingStudentTarget}>
            Add
          </Button>
        </form>
      </Card>

      {/* ── Paper instructions ───────────────────────────────── */}
      <Card>
        <h2 className="font-semibold text-primary-900 mb-1">Printed paper instructions</h2>
        <p className="text-xs text-text-muted mb-3">
          Printed at the top of the question paper. Leave blank for the standard wording.
        </p>
        <label htmlFor="instructions" className="text-xs font-medium text-[#666666]">
          One instruction per line
        </label>
        <textarea
          id="instructions"
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="mt-1.5 w-full rounded-xl border-2 border-[#E5E5E5] px-3 py-2 text-sm focus:border-[#02465B] focus:outline-none"
        />
        <div className="mt-2">
          <Button variant="outline" onClick={() => void patchAssessment({ instructions }, 'Instructions saved.')}>
            Save instructions
          </Button>
        </div>
      </Card>
    </div>
  );
}
