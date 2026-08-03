'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';

interface LessonRecord {
  id: string;
  className: string;
  streamName: string;
  lessonDate: string;
  period: number;
  status: string;
  learningArea: string;
  specificSkill: string;
}

const columns: DataTableColumn<LessonRecord>[] = [
  { key: 'lessonDate', header: 'Date', value: (l) => l.lessonDate },
  { key: 'className', header: 'Class', value: (l) => [l.className, l.streamName].filter(Boolean).join(' ') },
  { key: 'learningArea', header: 'Learning area', value: (l) => l.learningArea || '—' },
  { key: 'specificSkill', header: 'Topic covered', value: (l) => l.specificSkill || '—' },
  {
    key: 'status',
    header: 'Status',
    value: (l) => l.status,
    render: (l) => <Badge variant={l.status === 'taught' ? 'success' : 'muted'}>{l.status}</Badge>,
  },
];

export default function ParentLessonsPage() {
  const toast = useToast();
  const { selectedId, loading: childrenLoading } = useParentChildren();
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (studentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/parent/lessons?studentId=${studentId}`);
      const data = await res.json();
      if (data.success) setLessons(data.data);
      else toast.error(data.message ?? 'Failed to load lessons.');
    } catch {
      toast.error('Network error while loading lessons.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load(selectedId);
    })();
    return () => controller.abort();
  }, [selectedId, load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Lessons</h1>
        <p className="text-sm text-text-muted">Topics covered in your child&apos;s class, newest first.</p>
      </div>
      <DataTable
        rows={lessons}
        columns={columns}
        rowKey={(l) => l.id}
        loading={loading || childrenLoading}
        initialSort={{ key: 'lessonDate', direction: 'desc' }}
        searchPlaceholder="Search by learning area or topic…"
        emptyMessage="No lesson reports filed yet."
        exportFileName="child-lessons"
      />
    </div>
  );
}
