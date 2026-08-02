'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import { Select } from '@/components/ui/Select';
import { ParentChildrenProvider, useParentChildren } from '@/components/parent/ParentChildrenContext';
import { LayoutDashboard, Award, ClipboardCheck, BookOpen, Library, Bell, LogOut } from 'lucide-react';
import type { Role } from '@/lib/auth/session';

const PARENT_ROLES: Role[] = ['parent'];

const NAV = [
  { href: '/parent/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/parent/results', label: 'Results', icon: Award },
  { href: '/parent/attendance', label: 'Attendance', icon: ClipboardCheck },
  { href: '/parent/lessons', label: 'Lessons', icon: BookOpen },
  { href: '/parent/library', label: 'Library', icon: Library },
  { href: '/parent/notifications', label: 'Notifications', icon: Bell },
];

function ChildSwitcher() {
  const { children, loading, selectedId, selectChild } = useParentChildren();
  if (loading || children.length <= 1) return null;
  return (
    <div className="w-48">
      <Select
        aria-label="Choose a child"
        options={children.map((c) => ({ value: c.id, label: c.name }))}
        value={selectedId ?? ''}
        onChange={(e) => selectChild(e.target.value)}
      />
    </div>
  );
}

function ParentShell({ children: nodes }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex">
      <aside className="w-60 shrink-0 bg-bg-card border-r border-border hidden md:flex flex-col sticky top-0 h-screen">
        <div className="p-5 flex items-center gap-3 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-primary-700 flex items-center justify-center">
            <span className="text-white text-sm font-bold">TC</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-900">TERECO Parent</p>
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <button
            onClick={() => { logout(); router.push('/auth'); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-error hover:bg-error-bg"
          >
            <LogOut className="w-4.5 h-4.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="hidden md:flex items-center justify-end gap-3 px-8 py-2 border-b border-border bg-bg-card">
          <ChildSwitcher />
          <NotificationBell />
        </div>

        <div className="md:hidden flex flex-col gap-2 px-4 py-3 border-b border-border bg-bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <MobileNavDrawer
                title="TERECO Parent"
                subtitle={user?.name}
                items={NAV}
                onSignOut={() => { logout(); router.push('/auth'); }}
              />
              <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">TC</span>
              </div>
              <p className="text-sm font-semibold text-primary-900 truncate">TERECO Parent</p>
            </div>
            <NotificationBell />
          </div>
          <ChildSwitcher />
        </div>
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-x-hidden">{nodes}</main>
      </div>
    </div>
  );
}

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={PARENT_ROLES}>
      <Suspense fallback={null}>
        <ParentChildrenProvider>
          <ParentShell>{children}</ParentShell>
        </ParentChildrenProvider>
      </Suspense>
    </PortalGate>
  );
}
