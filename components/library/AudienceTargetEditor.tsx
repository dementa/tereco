'use client';

import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { X } from 'lucide-react';

export interface LibraryTarget {
  schoolId: string | null;
  level: number | null;
  classId: string | null;
  studentId: string | null;
}

export interface SchoolOption {
  id: string;
  name: string;
  classes: { id: string; displayName: string; level: number | null }[];
}

const GRADE_LEVELS = [
  { value: '1', label: 'P.1' },
  { value: '2', label: 'P.2' },
  { value: '3', label: 'P.3' },
  { value: '4', label: 'P.4' },
  { value: '5', label: 'P.5' },
  { value: '6', label: 'P.6' },
  { value: '7', label: 'P.7' },
];

function describeTarget(t: LibraryTarget, schools: SchoolOption[]): string {
  const school = schools.find((s) => s.id === t.schoolId);
  if (t.classId) {
    const cls = school?.classes.find((c) => c.id === t.classId);
    return `${school?.name ?? 'School'} — ${cls?.displayName ?? 'class'}`;
  }
  if (t.level) {
    return school ? `${school.name} — Grade ${t.level}` : `Grade ${t.level} (every school)`;
  }
  if (t.schoolId) return school?.name ?? 'One school';
  return 'Everyone';
}

/**
 * Mirrors the inline "Audience" section in app/admin/assessments/[id]/page.tsx
 * (no dedicated component exists there either — this is the first one, built
 * for Library rather than retrofitted onto assessments).
 *
 * `locked` disables removing the single whole-school row a teacher/school-admin
 * gets auto-inserted at creation (lib/entities/library-content.ts
 * createDraftLibraryContent) — they may only ADD narrower rows on top of it.
 * Only admin/super_admin (locked=false) may remove it, which is literally how
 * "make public" works: deleting that row is the entire mechanism.
 */
export function AudienceTargetEditor({
  targets,
  onChange,
  schools,
  locked = false,
  ownSchoolId,
}: {
  targets: LibraryTarget[];
  onChange: (targets: LibraryTarget[]) => void;
  schools: SchoolOption[];
  /** True for staff/school_admin editing their own upload. */
  locked?: boolean;
  /** When locked, narrowing is confined to this school. */
  ownSchoolId?: string;
}) {
  const [addSchoolId, setAddSchoolId] = useState('');
  const [addLevel, setAddLevel] = useState('');
  const [addClassId, setAddClassId] = useState('');

  const scopedSchools = locked && ownSchoolId ? schools.filter((s) => s.id === ownSchoolId) : schools;
  const classOptions = (locked ? ownSchoolId : addSchoolId)
    ? scopedSchools.find((s) => s.id === (locked ? ownSchoolId : addSchoolId))?.classes ?? []
    : [];

  /**
   * Deleting a whole-school row (the "make public" action, when unlocked) is
   * a no-op-looking widen if a narrower row for the same school still
   * exists — that narrower row keeps restricting visibility regardless
   * (epic #11 decision 4 / Acceptance Criterion #10). Warn before it
   * happens rather than let a super-admin discover it later as "why isn't
   * this actually public yet."
   */
  function remove(index: number) {
    const t = targets[index];
    const isWholeSchoolRow = t.schoolId !== null && !t.level && !t.classId && !t.studentId;
    if (!locked && isWholeSchoolRow) {
      const stillNarrowed = targets.some(
        (other, i) => i !== index && other.schoolId === t.schoolId && (other.level || other.classId || other.studentId)
      );
      if (stillNarrowed) {
        const proceed = window.confirm(
          "This item still has a narrower target (grade/class/student) for this school. Removing this row won't make it visible beyond that narrower target unless you also remove or widen it. Remove anyway?"
        );
        if (!proceed) return;
      }
    }
    onChange(targets.filter((_, i) => i !== index));
  }

  function addClass() {
    if (!addClassId) return;
    const schoolId = locked ? ownSchoolId! : addSchoolId;
    onChange([...targets, { schoolId, level: null, classId: addClassId, studentId: null }]);
    setAddClassId('');
  }

  function addLevelTarget() {
    if (!addLevel) return;
    const schoolId = locked ? ownSchoolId! : addSchoolId || null;
    onChange([...targets, { schoolId, level: Number(addLevel), classId: null, studentId: null }]);
    setAddLevel('');
  }

  function addWholeSchool() {
    if (!addSchoolId) return;
    onChange([...targets, { schoolId: addSchoolId, level: null, classId: null, studentId: null }]);
    setAddSchoolId('');
  }

  const wholeSchoolIndex = locked
    ? targets.findIndex((t) => t.schoolId === ownSchoolId && !t.level && !t.classId && !t.studentId)
    : -1;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-text-muted tracking-wide">Audience</p>

      <div className="flex flex-wrap gap-2">
        {targets.length === 0 && <Badge variant="accent">Everyone</Badge>}
        {targets.map((t, i) => (
          <Badge key={i} variant="default" className="flex items-center gap-1.5">
            {describeTarget(t, schools)}
            {i !== wholeSchoolIndex && (
              <button type="button" onClick={() => remove(i)} aria-label="Remove" className="hover:text-error">
                <X className="w-3 h-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {wholeSchoolIndex !== -1 && (
        <p className="text-xs text-text-muted">
          This item is scoped to your school by default. A super-admin can later make it visible to every school.
        </p>
      )}

      {/* Fixed-width selects (w-48/w-36/w-40) are wider than the usable area of
          a 360px screen once card padding is taken off, so below `xs` each
          control takes the full line instead of being squeezed by its siblings. */}
      <div className="flex flex-col xs:flex-row xs:flex-wrap items-stretch xs:items-end gap-2 pt-1">
        {!locked && (
          <Select
            label="School"
            value={addSchoolId}
            onChange={(e) => setAddSchoolId(e.target.value)}
            options={[{ value: '', label: 'Every school' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]}
            className="w-full xs:w-48"
          />
        )}
        <Select
          label="Grade level"
          value={addLevel}
          onChange={(e) => setAddLevel(e.target.value)}
          options={[{ value: '', label: 'Choose a grade' }, ...GRADE_LEVELS]}
          className="w-full xs:w-36"
        />
        <Button type="button" variant="outline" onClick={addLevelTarget} disabled={!addLevel}>
          Add grade
        </Button>
        <Select
          label="Class"
          value={addClassId}
          onChange={(e) => setAddClassId(e.target.value)}
          options={[{ value: '', label: 'Choose a class' }, ...classOptions.map((c) => ({ value: c.id, label: c.displayName }))]}
          className="w-full xs:w-40"
        />
        <Button type="button" variant="outline" onClick={addClass} disabled={!addClassId}>
          Add class
        </Button>
        {!locked && (
          <Button type="button" variant="outline" onClick={addWholeSchool} disabled={!addSchoolId}>
            Add whole school
          </Button>
        )}
      </div>
    </div>
  );
}
