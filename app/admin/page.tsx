'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Building2, Users, GraduationCap, UserRound } from 'lucide-react';

interface Stats {
  schools: number;
  staff: number;
  students: number;
  parents: number;
}

const CARDS = [
  { key: 'schools' as const, label: 'Schools', href: '/admin/system/schools', icon: Building2 },
  { key: 'staff' as const, label: 'Staff', href: '/admin/system/staff', icon: Users },
  { key: 'students' as const, label: 'Students', href: '/admin/system/students', icon: GraduationCap },
  { key: 'parents' as const, label: 'Parents', href: '/admin/system/parents', icon: UserRound },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ schools: 0, staff: 0, students: 0, parents: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // One counted query per entity, server-side — not four full list
        // fetches whose lengths happen to be the numbers we want.
        const res = await fetch('/api/admin/system/stats').then((r) => r.json());
        if (res.data) setStats(res.data);
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
