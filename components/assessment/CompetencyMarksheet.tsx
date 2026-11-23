'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { COMPETENCY_RESULTS } from '@/lib/competency-exam';

interface Stream {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  displayName: string;
  streams: Stream[];
}

interface Term {
  id: string;
  number: number;
  startsOn: string;
  endsOn: string;
}

interface Exam {
  systemId: string;
  name: string;
}

interface Row {
  studentId: string;
  systemId: string | null;
  name: string;
  marks: Record<string, number>;
  average: number | null;
}

function isCurrentTerm(t: Term): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return t.startsOn <= today && today <= t.endsOn;
}

function termLabel(t: Term): string {
  const year = new Date(t.startsOn).getUTCFullYear();
  return `${year} Term ${t.number}${isCurrentTerm(t) ? ' (current)' : ''}`;
}

/** 100 → "Completed", 70 → "Not completed", 0 → "Absent"; anything else has no label. */
function resultLabel(mark: number): string | null {
  return COMPETENCY_RESULTS.find((r) => r.score === mark)?.label ?? null;
}

const RESULT_TONE: Record<string, string> = {
  Completed: 'text-[#1A7A4A]',
  'Not completed': 'text-[#9A5B00]',
  Absent: 'text-text-muted',
};

/**
 * Competency marksheet — one term, one class: a learner per row and a column
 * per competency exam marked in that term (e.g. Drawing, Typing), with the
 * learner's average. Export gives the same sheet as PDF, Excel or CSV.
 */
export function CompetencyMarksheet({
  chooseSchool = false,
  backHref,
  backLabel,
}: {
  /** TERECO admins pick any school; teachers and school admins always see their own. */
  chooseSchool?: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  const toast = useToast();
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState('');
  const [exams, setExams] = useState<Exam[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  // Which school/term/class/stream the table currently shows; loading is "the
  // selection has moved on and its sheet has not arrived yet".
  const [loadedKey, setLoadedKey] = useState('');
  const requestKey = `${schoolId}|${termId}|${classId}|${streamId}`;
  const loading = !!termId && !!classId && loadedKey !== requestKey;

  // The pickers. For a TERECO admin this first lists the schools, then (once
  // one is chosen) that school's terms and classes.
  useEffect(() => {
    if (chooseSchool && schools.length > 0 && !schoolId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ options: '1' });
    if (chooseSchool && schoolId) params.set('schoolId', schoolId);
    fetch(`/api/competency-marksheet?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return toast.error(d.message ?? 'Could not load classes and terms.');
        if (d.data.schools) setSchools(d.data.schools);
        const classList = d.data.classes as SchoolClass[];
        setClasses(classList);
        setClassId(classList[0]?.id ?? '');
        setStreamId('');
        const termList = [...(d.data.terms as Term[])].sort((a, b) => b.startsOn.localeCompare(a.startsOn));
        setTerms(termList);
        // Default to the term we are in; between terms, the one that just ended.
        const today = new Date().toISOString().slice(0, 10);
        const pick = termList.find(isCurrentTerm) ?? termList.find((t) => t.startsOn <= today) ?? termList[0];
        setTermId(pick?.id ?? '');
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') toast.error('Network error while loading classes and terms.');
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chooseSchool, schoolId]);

  useEffect(() => {
    if (!classId || !termId) return;
    const controller = new AbortController();
    const key = `${schoolId}|${termId}|${classId}|${streamId}`;
    const params = new URLSearchParams({ termId, classId });
    if (streamId) params.set('streamId', streamId);
    if (chooseSchool && schoolId) params.set('schoolId', schoolId);
    fetch(`/api/competency-marksheet?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setExams(d.data.exams);
          setRows(d.data.rows);
        } else {
          setExams([]);
          setRows([]);
          toast.error(d.message ?? 'Could not load the marksheet.');
        }
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') toast.error('Network error while loading the marksheet.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedKey(key);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, classId, streamId, termId]);

  const selectedClass = classes.find((c) => c.id === classId);
  const selectedTerm = terms.find((t) => t.id === termId);

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      { key: 'systemId', header: 'Student ID', value: (r) => r.systemId ?? '', sortable: true, className: 'w-28' },
      { key: 'name', header: 'Name', value: (r) => r.name, sortable: true },
      ...exams.map<DataTableColumn<Row>>((exam) => ({
        key: `exam:${exam.systemId}`,
        header: exam.name,
        value: (r) => r.marks[exam.systemId] ?? undefined,
        sortable: true,
        align: 'right',
        render: (r) => {
          const mark = r.marks[exam.systemId];
          if (mark === undefined) return <span className="text-text-faint">Not marked</span>;
          const label = resultLabel(mark);
          return (
            <span className="tabular-nums">
              <span className="font-semibold text-primary-900">{mark}</span>
              {label && <span className={`ml-1.5 text-xs ${RESULT_TONE[label] ?? ''}`}>{label}</span>}
            </span>
          );
        },
        exportValue: (r) => r.marks[exam.systemId] ?? null,
        pdfValue: (r) => {
          const mark = r.marks[exam.systemId];
          if (mark === undefined) return '—';
          const label = resultLabel(mark);
          return label ? `${mark} (${label})` : mark;
        },
      })),
      {
        key: 'average',
        header: 'Average',
        value: (r) => r.average ?? undefined,
        sortable: true,
        align: 'right',
        render: (r) =>
          r.average === null ? '—' : <span className="font-semibold text-primary-900 tabular-nums">{r.average}%</span>,
        exportValue: (r) => r.average,
        pdfValue: (r) => (r.average === null ? '—' : `${Math.round(r.average)}%`),
      },
    ],
    [exams]
  );

  const stream = selectedClass?.streams.find((s) => s.id === streamId);
  const exportName = [
    'competency-marksheet',
    chooseSchool ? (schools.find((x) => x.id === schoolId)?.name ?? '') : '',
    selectedTerm ? termLabel(selectedTerm).replace(' (current)', '') : '',
    selectedClass?.displayName ?? '',
    stream?.name ?? '',
  ]
    .filter(Boolean)
    .join(' - ');

  return (
    <div className="space-y-4">
      <div>
        {backHref && (
          <Link href={backHref} className="text-sm text-text-muted hover:text-primary-700 block mb-2">
            ← {backLabel ?? 'Back'}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Competency marksheet</h1>
        <p className="text-sm text-text-muted">
          Every learner in the class with their mark for each practical exam this term. Completed 100, Not completed
          70, Absent 0. Use Export for a PDF or Excel copy.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          {chooseSchool && (
            <select
              value={schoolId}
              onChange={(e) => {
                // The old school's terms and classes mean nothing for the new
                // one; clear them so a stale id is never sent with it.
                setSchoolId(e.target.value);
                setTerms([]);
                setTermId('');
                setClasses([]);
                setClassId('');
                setStreamId('');
                setExams([]);
                setRows([]);
              }}
              className="border border-border rounded-lg px-3 py-2 text-sm"
              aria-label="School"
            >
              <option value="">{schools.length === 0 ? 'Loading schools…' : 'Choose a school…'}</option>
              {schools.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm"
            aria-label="Term"
          >
            {terms.length === 0 && (
              <option value="">{chooseSchool && !schoolId ? 'Term' : 'No terms set up'}</option>
            )}
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {termLabel(t)}
              </option>
            ))}
          </select>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStreamId('');
            }}
            className="border border-border rounded-lg px-3 py-2 text-sm"
            aria-label="Class"
          >
            {classes.length === 0 && (
              <option value="">{chooseSchool && !schoolId ? 'Class' : 'No classes'}</option>
            )}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
          {selectedClass && selectedClass.streams.length > 0 && (
            <select
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm"
              aria-label="Stream"
            >
              <option value="">All streams</option>
              {selectedClass.streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {!loading && rows.length > 0 && exams.length === 0 && (
          <p className="text-sm text-text-muted mb-3">
            No competency marks were saved for this class during this term. Marks count towards the term in which they
            were saved.
          </p>
        )}

        {chooseSchool && !schoolId ? (
          <p className="text-sm text-text-muted py-6 text-center">Choose a school to see its marksheet.</p>
        ) : (
        <DataTable
          // Remount when the exam columns change so the export column picker
          // picks up the new set instead of keeping the previous term's.
          key={exams.map((e) => e.systemId).join(',')}
          rows={rows}
          columns={columns}
          rowKey={(r) => r.studentId}
          loading={loading}
          initialSort={{ key: 'name', direction: 'asc' }}
          searchPlaceholder="Find a learner by name or ID…"
          emptyMessage="No learners in this class."
          mobileTitle={(r) => r.name}
          pageSize={100}
          numbered
          exportFileName={exportName}
        />
        )}
      </Card>
    </div>
  );
}
