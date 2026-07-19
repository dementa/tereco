'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { School, UserCog, GraduationCap, Contact } from 'lucide-react';

interface Stats {
  schools: number;
  staff: number;
  students: number;
  parents: number;
}

const CARDS = [
  { key: 'schools' as const, label: 'Schools', href: '/admin/system/schools', icon: School },
  { key: 'staff' as const, label: 'Staff & Admins', href: '/admin/system/staff', icon: UserCog },
  { key: 'students' as const, label: 'Student Accounts', href: '/admin/system/students', icon: GraduationCap },
  { key: 'parents' as const, label: 'Parents', href: '/admin/system/parents', icon: Contact },
];

export default function SystemDashboard() {
  const [stats, setStats] = useState<Stats>({ schools: 0, staff: 0, students: 0, parents: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [schools, staff, students, parents] = await Promise.all([
          fetch('/api/admin/system/schools').then((r) => r.json()),
          fetch('/api/admin/system/staff').then((r) => r.json()),
          fetch('/api/admin/system/students').then((r) => r.json()),
          fetch('/api/admin/system/parents').then((r) => r.json()),
        ]);
        setStats({
          schools: schools.data?.length ?? 0,
          staff: staff.data?.length ?? 0,
          students: students.data?.length ?? 0,
          parents: parents.data?.length ?? 0,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">System</h1>
      <p className="text-sm text-text-muted mb-6">Create and manage every account and school. Super admin only.</p>

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
