'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { TopPerformersCard } from '@/components/ui/TopPerformersCard';
import { useAuth } from '@/components/auth/AuthContext';
import { Award, ClipboardList } from 'lucide-react';

const TILES = [
  { href: '/student/list', label: 'My Assessments', description: 'See what’s open to sit and start one.', icon: ClipboardList },
  { href: '/student/results', label: 'My Results', description: 'See every assessment you’ve attempted and its score.', icon: Award },
];

interface TopPerformersResult {
  topPerformers: { studentId: string; studentName: string; rank: number }[];
  isFeatured: boolean;
  message: string | null;
}

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [topPerformers, setTopPerformers] = useState<TopPerformersResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/student/performance');
        const data = await res.json();
        if (!controller.signal.aborted && data.success) setTopPerformers(data.data);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">
        {user?.name ? `Welcome, ${user.name.split(' ')[0]}` : 'Dashboard'}
      </h1>
      <p className="text-sm text-text-muted mb-6">Your assessments, all in one place.</p>

      <div className="mb-6">
        <TopPerformersCard data={topPerformers} loading={loading} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}>
              <Card hover className="p-5 h-full">
                <div className="p-2.5 rounded-xl bg-bg-muted w-fit mb-3">
                  <Icon className="w-5 h-5 text-primary-700" />
                </div>
                <p className="font-semibold text-primary-900">{t.label}</p>
                <p className="text-sm text-text-muted mt-1">{t.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
