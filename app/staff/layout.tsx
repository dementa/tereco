'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileTabBar } from '@/components/ui/MobileTabBar';
import { LayoutDashboard, FileText, ClipboardList, CheckSquare, LogOut } from 'lucide-react';
import type { Role } from '@/lib/auth/session';

const STAFF_ROLES: Role[] = ['staff'];

const NAV = [
  { href: '/staff', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/staff/lessons', label: 'My Lesson Reports', short: 'Lessons', icon: FileText },
  { href: '/staff/assessments', label: 'My Assessments', short: 'Assess', icon: ClipboardList },
  { href: '/staff/marking', label: 'Marking', icon: CheckSquare },
];

function StaffShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex">
      <aside className="w-60 shrink-0 bg-bg-card border-r border-primary-100 hidden md:flex flex-col">
        <div className="p-5 flex items-center gap-3 border-b border-primary-100">
          <div className="w-10 h-10 rounded-xl bg-primary-700 flex items-center justify-center">
            <span className="text-white text-sm font-bold">TC</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-900">TERECO Staff</p>
            <p className="text-xs text-text-muted truncate">{user?.name}</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  active
                    ? 'bg-primary-700 text-white'
                    : 'text-text-secondary hover:bg-primary-50'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-primary-100 space-y-1">
          <button
            onClick={() => { logout(); router.push('/auth'); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-error hover:bg-error-bg"
          >
            <LogOut className="w-4.5 h-4.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="hidden md:flex items-center justify-end gap-2 px-8 py-2 border-b border-primary-100 bg-bg-card">
          <NotificationBell />
        </div>

        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-primary-100 bg-bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">TC</span>
            </div>
            <p className="text-sm font-semibold text-primary-900 truncate">TERECO Staff</p>
          </div>
          <NotificationBell />
        </div>
        <main className="flex-1 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 overflow-x-hidden">{children}</main>
      </div>

      <MobileTabBar tabs={NAV} onSignOut={() => { logout(); router.push('/auth'); }} />
    </div>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={STAFF_ROLES}>
      <StaffShell>{children}</StaffShell>
    </PortalGate>
  );
}
