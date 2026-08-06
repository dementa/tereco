'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { TopPerformersCard } from '@/components/ui/TopPerformersCard';
import { ClassLessonFeed } from '@/components/ui/ClassLessonFeed';
import { PromoCarousel } from '@/components/ui/PromoCarousel';
import { useAuth } from '@/components/auth/AuthContext';
import { Award, ClipboardList, Library } from 'lucide-react';

const TILES = [
  { href: '/student/list', label: 'My Assessments', description: 'See what’s open to sit and start one.', icon: ClipboardList },
  { href: '/student/results', label: 'My Results', description: 'See every assessment you’ve attempted and its score.', icon: Award },
  // The Library has always been reachable from the sidebar, but that sidebar is
  // behind a drawer on a phone — which is how most of these learners arrive.
  // A tile here is the cheap half of the discovery problem; the carousel above
  // is the other half.
  { href: '/student/library', label: 'Library', description: 'Practice papers, videos and reading for free time.', icon: Library },
];

interface PromoSlide {
  id: string;
  kind: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
}

interface TopPerformersResult {
  topPerformers: { studentId: string; studentName: string; rank: number }[];
  isFeatured: boolean;
  message: string | null;
}

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [topPerformers, setTopPerformers] = useState<TopPerformersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [promos, setPromos] = useState<PromoSlide[]>([]);

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

  // Fetched separately so the strip never delays the rest of the dashboard, and
  // a failure here costs the learner nothing — the carousel simply does not
  // appear. It is a suggestion, not information they came for.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/student/promos', { signal: controller.signal })
      .then((r) => r.json())
      .then((res) => {
        if (!controller.signal.aborted && res.success) setPromos(res.data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">
        {user?.name ? `Welcome, ${user.name.split(' ')[0]}` : 'Dashboard'}
      </h1>
      <p className="text-sm text-text-muted mb-6">Your assessments, all in one place.</p>

      {/*
        Above the leaderboard on purpose. This is the only thing on the learner's
        dashboard that points at something they have not already come here to do,
        and below the fold it may as well not exist.
      */}
      {promos.length > 0 && (
        <div className="mb-6">
          <PromoCarousel slides={promos} />
        </div>
      )}

      <div className="mb-6">
        <TopPerformersCard data={topPerformers} loading={loading} />
      </div>

      <div className="mb-6">
        <ClassLessonFeed />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}>
              <Card hover className="p-5 h-full">
                <div className="p-2 sm:p-2.5 rounded-xl bg-bg-muted w-fit mb-2 sm:mb-3">
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
