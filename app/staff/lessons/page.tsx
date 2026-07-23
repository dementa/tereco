'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ChevronDown, ChevronUp, FileText, Plus } from 'lucide-react';

interface Lesson {
  id: string;
  school: string;
  className: string;
  lessonDate: string;
  period: string;
  status: string;
  learningArea: string;
  specificSkill: string;
  approach: string;
  present: number;
  absent: number;
  computerAccess: string;
  overallProgress: string;
  achievement: string;
  challenges: string;
  challengeDetails: string;
  supportRequired: string;
  reference: string;
  teacher: string;
  createdAt: string;
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm text-primary-900">{value || '—'}</p>
    </div>
  );
}

export default function StaffLessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/lessons')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setLessons(d.data);
        else setError(d.message || 'Failed to load');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = lessons.filter((l) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [l.reference, l.school, l.className, l.learningArea]
      .some((f) => f.toLowerCase().includes(q));
  });

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-primary-900">My Lesson Reports</h1>
        <Link href="/staff/lessons/new">
          <Button>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            New lesson report
          </Button>
        </Link>
      </div>
      <p className="text-sm text-text-muted mb-6">Daily ICT lesson records you&apos;ve submitted.</p>

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search by reference, school, class…"
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
          <FileText className="w-10 h-10 text-text-faint mx-auto mb-3" />
          <p className="text-text-muted">No lesson reports yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((l) => {
            const open = expanded === l.id;
            return (
              <Card key={l.id} className="p-0 overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : l.id)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-primary-50/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-primary-900 truncate">
                      {l.reference || 'No reference'} • {l.className}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {l.school} • {l.learningArea} • {l.lessonDate}
                    </p>
                  </div>
                  {open ? <ChevronUp className="w-5 h-5 text-text-muted shrink-0" /> : <ChevronDown className="w-5 h-5 text-text-muted shrink-0" />}
                </button>
                {open && (
                  <div className="border-t border-primary-100 p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Detail label="Reference" value={l.reference} />
                    <Detail label="Date" value={l.lessonDate} />
                    <Detail label="School" value={l.school} />
                    <Detail label="Class" value={l.className} />
                    <Detail label="Period" value={l.period} />
                    <Detail label="Status" value={l.status} />
                    <Detail label="Learning area" value={l.learningArea} />
                    <Detail label="Specific skill" value={l.specificSkill} />
                    <Detail label="Approach" value={l.approach} />
                    <Detail label="Present" value={l.present} />
                    <Detail label="Absent" value={l.absent} />
                    <Detail label="Computer access" value={l.computerAccess} />
                    <Detail label="Overall progress" value={l.overallProgress} />
                    <Detail label="Challenges" value={l.challenges} />
                    <div className="col-span-2 sm:col-span-3">
                      <Detail label="Achievement" value={l.achievement} />
                    </div>
                    {l.challengeDetails && (
                      <div className="col-span-2 sm:col-span-3">
                        <Detail label="Challenge details" value={l.challengeDetails} />
                      </div>
                    )}
                    {l.supportRequired && (
                      <div className="col-span-2 sm:col-span-3">
                        <Detail label="Support required" value={l.supportRequired} />
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
