'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import {
  LayoutDashboard,
  Layers,
  UserCog,
  GraduationCap,
  ClipboardCheck,
  ClipboardList,
  School,
  LogOut,
  TrendingUp,
  CalendarDays,
  Library,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';

const SCHOOL_ADMIN_ROLES: Role[] = ['school_admin'];

const NAV = [
  { href: '/school-admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/school-admin/classes', label: 'Classes & Streams', icon: Layers },
  { href: '/school-admin/staff', label: 'Staff', icon: UserCog },
  { href: '/school-admin/students', label: 'Students', icon: GraduationCap },
  { href: '/school-admin/attendance', label: 'Attendance', icon: ClipboardCheck },
  { href: '/school-admin/assessments', label: 'Assessments', icon: ClipboardList },
  { href: '/school-admin/library', label: 'Library', icon: Library },
  { href: '/school-admin/performance', label: 'Performance', icon: TrendingUp },
  { href: '/school-admin/terms', label: 'Terms', icon: CalendarDays },
  { href: '/school-admin/school', label: 'My School', icon: School },
];

function SchoolAdminShell({ children }: { children: React.ReactNode }) {
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
            <p className="text-sm font-semibold text-primary-900">School Admin</p>
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
        <div className="hidden md:flex items-center justify-end gap-2 px-8 py-2 border-b border-border bg-bg-card">
          <NotificationBell />
        </div>

        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavDrawer
              title="School Admin"
              subtitle={user?.name}
              items={NAV}
              onSignOut={() => { logout(); router.push('/auth'); }}
            />
            <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">TC</span>
            </div>
            <p className="text-sm font-semibold text-primary-900 truncate">School Admin</p>
          </div>
          <NotificationBell />
        </div>
        <main className="flex-1 p-3 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export default function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={SCHOOL_ADMIN_ROLES}>
      <SchoolAdminShell>{children}</SchoolAdminShell>
    </PortalGate>
  );
}
