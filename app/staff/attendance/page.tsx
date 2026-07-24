'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ClipboardCheck, Plus } from 'lucide-react';

interface AttendanceSession {
  id: string;
  school: string;
  className: string;
  streamName: string;
  sessionDate: string;
  period: number;
  present: number;
  absent: number;
  takenAt: string;
  attached: boolean;
  lessonReportReference: string | null;
}

export default function StaffAttendancePage() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/attendance')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setSessions(d.data);
        else setError(d.message || 'Failed to load');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = sessions.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [s.school, s.className, s.streamName].some((f) => f.toLowerCase().includes(q));
  });

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-primary-900">Attendance</h1>
        <Link href="/staff/attendance/new">
          <Button>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            New attendance
          </Button>
        </Link>
      </div>
      <p className="text-sm text-text-muted mb-6">Rosters you&apos;ve taken, attached or not, to a lesson report.</p>

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search by school, class…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-error">{error}</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <ClipboardCheck className="w-10 h-10 text-text-faint mx-auto mb-3" />
          <p className="text-text-muted">No attendance taken yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-primary-900 truncate">
                    {s.className}{s.streamName ? ` ${s.streamName}` : ''} • Period {s.period}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {s.school} • {s.sessionDate}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    s.attached ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {s.attached ? `Attached${s.lessonReportReference ? ` • ${s.lessonReportReference}` : ''}` : 'Not attached yet'}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm text-text-secondary">
                <span>{s.present} present</span>
                <span>{s.absent} absent</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
