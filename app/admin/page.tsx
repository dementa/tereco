'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { FileText, Users, GraduationCap, ClipboardList } from 'lucide-react';

interface Stats {
  lessons: number;
  assessments: number;
  students: number;
  users: number;
}

const CARDS = [
  { key: 'lessons' as const, label: 'Lesson Submissions', href: '/admin/lessons', icon: FileText },
  { key: 'assessments' as const, label: 'Assessments', href: '/admin/assessments', icon: ClipboardList },
  { key: 'students' as const, label: 'Students', href: '/admin/students', icon: GraduationCap },
  { key: 'users' as const, label: 'Staff Users', href: '/admin/users', icon: Users },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ lessons: 0, assessments: 0, students: 0, users: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [lessons, assessments, students, users] = await Promise.all([
          fetch('/api/admin/lessons').then((r) => r.json()),
          fetch('/api/admin/assessments').then((r) => r.json()),
          fetch('/api/admin/students').then((r) => r.json()),
          fetch('/api/admin/users').then((r) => r.json()),
        ]);
        setStats({
          lessons: lessons.data?.length ?? 0,
          assessments: assessments.data?.length ?? 0,
          students: students.data?.length ?? 0,
          users: users.data?.length ?? 0,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Dashboard</h1>
      <p className="text-sm text-text-muted mb-6">Overview of TERECO data.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>
    </div>
  );
}
