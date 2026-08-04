'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Sparkline } from '@/components/ui/Sparkline';
import { GenderDonutChart } from '@/components/ui/GenderDonutChart';
import { PopulationBarChart } from '@/components/ui/PopulationBarChart';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { Building2, Users, GraduationCap, UserRound, TrendingUp } from 'lucide-react';

interface Stats {
  schools?: number;
  staff?: number;
  students?: number;
  parents?: number;
}

interface TrendPoint {
  label: string;
  value: number;
}

interface GenderBreakdownEntry {
  gender: 'male' | 'female' | 'unspecified';
  count: number;
}

interface PopulationEntry {
  label: string;
  count: number;
}

interface ActivityItem {
  type: 'enrollment' | 'submission';
  label: string;
  timestamp: string;
}

interface Analytics {
  gender: GenderBreakdownEntry[];
  population: PopulationEntry[];
  activity: ActivityItem[];
}

const ADMIN_CARDS = [
  { key: 'schools' as const, label: 'Schools', href: '/admin/system/schools', icon: Building2 },
  { key: 'staff' as const, label: 'Staff', href: '/admin/system/staff', icon: Users },
  { key: 'students' as const, label: 'Students', href: '/admin/system/students', icon: GraduationCap },
  { key: 'parents' as const, label: 'Parents', href: '/admin/system/parents', icon: UserRound },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

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

  useEffect(() => {
    async function loadTrend() {
      const res = await fetch('/api/admin/system/performance?trend=1').then((r) => r.json());
      if (res.success) setTrend(res.data);
    }
    loadTrend();
  }, []);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetch('/api/admin/system/analytics').then((r) => r.json());
        if (res.success) setAnalytics(res.data);
      } finally {
        setAnalyticsLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Dashboard</h1>
      <p className="text-sm text-text-muted mb-6">Overview of TERECO data.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-4">
        {ADMIN_CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.key} href={c.href}>
              <Card hover className="p-3 sm:p-5">
                <div className="p-2 sm:p-2.5 rounded-xl bg-bg-muted w-fit mb-2 sm:mb-3">
                  <Icon className="w-5 h-5 text-primary-700" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-primary-900 tabular-nums">
                  {loading ? '—' : (stats[c.key] ?? 0)}
                </p>
                <p className="text-sm text-text-muted mt-1">{c.label}</p>
              </Card>
            </Link>
          );
        })}

        <Link href="/admin/performance">
          <Card hover className="p-3 sm:p-5">
            <div className="p-2 sm:p-2.5 rounded-xl bg-accent-lighter w-fit mb-2 sm:mb-3">
              <TrendingUp className="w-5 h-5 text-accent-dark" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-primary-900 tabular-nums">
              {trend.length > 0 ? `${trend[trend.length - 1].value}%` : '—'}
            </p>
            <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 mt-1">
              <p className="text-sm text-text-muted">Performance</p>
              <div className="shrink-0"><Sparkline points={trend.map((t) => t.value)} /></div>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-primary-900 mb-3">Students by gender</h2>
          {analyticsLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <GenderDonutChart data={analytics?.gender ?? []} />
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-primary-900 mb-3">Population by class</h2>
          {analyticsLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <PopulationBarChart data={analytics?.population ?? []} />
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-primary-900 mb-3">Recent activity</h2>
          {analyticsLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <ActivityFeed items={analytics?.activity ?? []} />
          )}
        </Card>
      </div>
    </div>
  );
}
