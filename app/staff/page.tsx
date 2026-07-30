'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Sparkline } from '@/components/ui/Sparkline';
import { CheckSquare, ClipboardList, FileText, TrendingUp } from 'lucide-react';

interface Stats {
  lessons?: number;
  assessments?: number;
  toMark?: number;
}

interface TrendPoint {
  label: string;
  value: number;
}

const CARDS = [
  { key: 'lessons' as const, label: 'My Lesson Reports', href: '/staff/lessons', icon: FileText },
  { key: 'assessments' as const, label: 'My Assessments', href: '/staff/assessments', icon: ClipboardList },
  { key: 'toMark' as const, label: 'Answers To Mark', href: '/staff/marking', icon: CheckSquare },
];

export default function StaffDashboard() {
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/system/stats').then((r) => r.json());
        if (res.data) setStats(res.data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadTrend() {
      const res = await fetch('/api/staff/performance?trend=1').then((r) => r.json());
      if (res.success) setTrend(res.data);
    }
    loadTrend();
  }, []);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Dashboard</h1>
      <p className="text-sm text-text-muted mb-6">Your lesson reports, papers and marking.</p>

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
                  {loading ? '—' : (stats[c.key] ?? 0)}
                </p>
                <p className="text-sm text-text-muted mt-1">{c.label}</p>
              </Card>
            </Link>
          );
        })}

        <Link href="/staff/performance">
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
