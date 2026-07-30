'use client';

import { GraduationCap, ClipboardCheck } from 'lucide-react';

interface ActivityItem {
  type: 'enrollment' | 'submission';
  label: string;
  timestamp: string;
}

const ICONS: Record<ActivityItem['type'], typeof GraduationCap> = {
  enrollment: GraduationCap,
  submission: ClipboardCheck,
};

// Same relative-time rule as components/ui/NotificationBell.tsx's timeAgo —
// duplicated rather than shared since neither file exports it today.
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface ActivityFeedProps {
  items: ActivityItem[];
}

/**
 * Built from enrollments + marked submissions, not the (currently unwritten)
 * audit_log table — see getRecentActivity in lib/entities/analytics.ts.
 */
export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">No recent activity yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const Icon = ICONS[item.type];
        return (
          <li key={`${item.type}-${item.timestamp}-${index}`} className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-bg-muted shrink-0 mt-0.5">
              <Icon className="w-3.5 h-3.5 text-primary-700" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-text-primary truncate">{item.label}</p>
              <p className="text-xs text-text-muted">{timeAgo(item.timestamp)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
