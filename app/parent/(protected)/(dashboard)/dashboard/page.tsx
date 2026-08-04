'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TopPerformersCard } from '@/components/ui/TopPerformersCard';
import { useAuth } from '@/components/auth/AuthContext';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';
import { Award, ClipboardCheck, BookOpen, Bell } from 'lucide-react';

interface TopPerformersResult {
  topPerformers: { studentId: string; studentName: string; rank: number }[];
  isFeatured: boolean;
  message: string | null;
}

const TILES = [
  { href: '/parent/results', label: 'Results', description: "See your child's assessment results.", icon: Award },
  { href: '/parent/attendance', label: 'Attendance', description: "See your child's attendance history.", icon: ClipboardCheck },
  { href: '/parent/lessons', label: 'Lessons', description: 'See topics covered in class.', icon: BookOpen },
  { href: '/parent/notifications', label: 'Notifications', description: 'Announcements and updates.', icon: Bell },
];

export default function ParentDashboardPage() {
  const { user } = useAuth();
  const { children, loading, selectedId } = useParentChildren();
  const selected = children.find((c) => c.id === selectedId);

  const [topPerformers, setTopPerformers] = useState<TopPerformersResult | null>(null);
  const [topPerformersLoading, setTopPerformersLoading] = useState(false);

  const loadTopPerformers = useCallback(async (studentId: string) => {
    setTopPerformersLoading(true);
    try {
      const res = await fetch(`/api/parent/performance?studentId=${studentId}`);
      const data = await res.json();
      if (data.success) setTopPerformers(data.data);
    } finally {
      setTopPerformersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await loadTopPerformers(selectedId);
    })();
    return () => controller.abort();
  }, [selectedId, loadTopPerformers]);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">
        {user?.name ? `Welcome, ${user.name.split(' ')[0]}` : 'Dashboard'}
      </h1>
      <p className="text-sm text-text-muted mb-6">Your children&apos;s assessments, attendance and lessons.</p>

      {!loading && children.length === 0 && (
        <Card className="p-5 mb-6">
          <p className="text-sm text-text-muted">
            No children are linked to your account yet. Contact your school or TERECO administrator.
          </p>
        </Card>
      )}

      {selected && (
        <Card className="p-5 mb-6">
          <p className="text-xs font-medium text-[#666666] tracking-wide mb-1">VIEWING</p>
          <p className="font-semibold text-primary-900 flex items-center gap-2">
            {selected.name}
            {selected.className && <Badge variant="muted">{selected.className}</Badge>}
          </p>
        </Card>
      )}

      {selectedId && (
        <div className="mb-6">
          <TopPerformersCard data={topPerformers} loading={topPerformersLoading} />
        </div>
      )}

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
