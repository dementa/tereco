'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { LessonAnalyticsPanel } from '@/components/ui/LessonAnalyticsPanel';
import { useToast } from '@/components/ui/ToastProvider';

interface Lesson {
  id: string;
  className: string;
  streamName: string;
  lessonDate: string;
  period: number;
  status: string;
  learningArea: string;
  specificSkill: string;
  teacher: string;
  reviewed: boolean;
}

const columns: DataTableColumn<Lesson>[] = [
  { key: 'lessonDate', header: 'Date', value: (l) => l.lessonDate },
  { key: 'className', header: 'Class', value: (l) => [l.className, l.streamName].filter(Boolean).join(' ') },
  { key: 'teacher', header: 'Teacher', value: (l) => l.teacher },
  { key: 'learningArea', header: 'Learning area', value: (l) => l.learningArea, hideOnMobile: true },
  { key: 'specificSkill', header: 'Specific skill', value: (l) => l.specificSkill, hideOnMobile: true },
  { key: 'status', header: 'Status', value: (l) => l.status },
  {
    key: 'reviewed',
    header: 'Reviewed',
    value: (l) => (l.reviewed ? 'Reviewed' : 'Pending'),
    render: (l) => (l.reviewed ? <Badge variant="success">Reviewed</Badge> : <Badge variant="muted">Pending</Badge>),
  },
];

export default function SchoolAdminLessonsPage() {
  const toast = useToast();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/school-admin/lessons');
        const data = await res.json();
        if (cancelled) return;
        if (data.success) setLessons(data.data);
        else toast.error(data.message ?? 'Failed to load lessons.');
      } catch {
        if (!cancelled) toast.error('Network error while loading lessons.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Lessons</h1>
        <p className="text-sm text-text-muted">
          Daily ICT lesson records filed by your teachers. Read-only — review happens in the admin console.
        </p>
      </div>

      <LessonAnalyticsPanel endpoint="/api/school-admin/lessons/analytics" breakdownLabel="Class" />

      <Card>
        <DataTable
          rows={lessons}
          columns={columns}
          rowKey={(l) => l.id}
          loading={loading}
          initialSort={{ key: 'lessonDate', direction: 'desc' }}
          searchPlaceholder="Search by class, teacher, learning area…"
          emptyMessage="No lesson reports filed yet."
          exportFileName="school-lessons"
        />
      </Card>
    </div>
  );
}
