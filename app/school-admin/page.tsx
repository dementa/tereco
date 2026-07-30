'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Sparkline } from '@/components/ui/Sparkline';
import { Layers, UserCog, GraduationCap, ClipboardCheck, ClipboardList, TrendingUp } from 'lucide-react';

interface Stats {
  classes: number;
  staff: number;
  students: number;
  attendance: number;
  assessments: number;
}

interface TrendPoint {
  label: string;
  value: number;
}

const CARDS = [
  { key: 'classes' as const, label: 'Classes & Streams', href: '/school-admin/classes', icon: Layers },
  { key: 'staff' as const, label: 'Staff', href: '/school-admin/staff', icon: UserCog },
  { key: 'students' as const, label: 'Students', href: '/school-admin/students', icon: GraduationCap },
  { key: 'attendance' as const, label: 'Attendance Sessions', href: '/school-admin/attendance', icon: ClipboardCheck },
  { key: 'assessments' as const, label: 'Assessments', href: '/school-admin/assessments', icon: ClipboardList },
];

export default function SchoolAdminDashboard() {
  const [stats, setStats] = useState<Stats>({ classes: 0, staff: 0, students: 0, attendance: 0, assessments: 0 });
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [classes, staff, students, attendance, assessments] = await Promise.all([
          fetch('/api/school-admin/classes').then((r) => r.json()),
          fetch('/api/school-admin/staff').then((r) => r.json()),
          fetch('/api/school-admin/students').then((r) => r.json()),
          fetch('/api/school-admin/attendance').then((r) => r.json()),
          fetch('/api/school-admin/assessments').then((r) => r.json()),
        ]);
        setStats({
          classes: classes.data?.length ?? 0,
          staff: staff.data?.length ?? 0,
          students: students.data?.length ?? 0,
          attendance: attendance.data?.length ?? 0,
          assessments: assessments.data?.length ?? 0,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadTrend() {
      const res = await fetch('/api/school-admin/performance?trend=1').then((r) => r.json());
      if (res.success) setTrend(res.data);
    }
    loadTrend();
  }, []);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Dashboard</h1>
      <p className="text-sm text-text-muted mb-6">Your school&apos;s classes, staff, students and activity.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.key} href={c.href}>
              <Card hover className="p-5">
                <div className="p-2.5 rounded-xl bg-bg-muted w-fit mb-3">
                  <Icon className="w-5 h-5 text-primary-700" />
                </div>
                <p className="text-3xl font-bold text-primary-900">
                  {loading ? '—' : stats[c.key]}
                </p>
                <p className="text-sm text-text-muted mt-1">{c.label}</p>
              </Card>
            </Link>
          );
        })}

        <Link href="/school-admin/performance">
          <Card hover className="p-5">
            <div className="p-2.5 rounded-xl bg-accent-lighter w-fit mb-3">
              <TrendingUp className="w-5 h-5 text-accent-dark" />
            </div>
            <p className="text-3xl font-bold text-primary-900">
              {trend.length > 0 ? `${trend[trend.length - 1].value}%` : '—'}
            </p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-sm text-text-muted">Performance</p>
              <Sparkline points={trend.map((t) => t.value)} />
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
