'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileTabBar } from '@/components/ui/MobileTabBar';
import {
  LayoutDashboard, FileText, GraduationCap, ClipboardList,
  CheckSquare, LogOut, School, UserCog, Contact, CalendarDays,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';

// The old /admin/students and /admin/users roster pages are gone: they were the
// pre-Supabase-Auth surface, built on the dropped `students`/`users` tables and
// a hardcoded school list. Their replacements are under System below.
const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/lessons', label: 'Lesson Submissions', short: 'Lessons', icon: FileText },
  { href: '/admin/assessments', label: 'Assessments', icon: ClipboardList },
  { href: '/admin/marking', label: 'Marking', icon: CheckSquare },
];

// Super-admin-only account provisioning — separate from the day-to-day
// roster pages above (route-level guarded by requireSuperAdmin too, this is
// just nav visibility).
const SYSTEM_NAV = [
  { href: '/admin/system/academic-years', label: 'Academic Years', icon: CalendarDays },
  { href: '/admin/system/schools', label: 'Schools', icon: School },
  { href: '/admin/system/staff', label: 'Staff & Admins', icon: UserCog },
  { href: '/admin/system/students', label: 'Student Accounts', icon: GraduationCap },
  { href: '/admin/system/parents', label: 'Parents', icon: Contact },
];

const ADMIN_ROLES: Role[] = ['admin', 'super_admin'];

function AdminShell({ children }: { children: React.ReactNode }) {
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
            <p className="text-sm font-semibold text-primary-900">TERECO Admin</p>
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

          {user?.role === 'super_admin' && (
            <>
              <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-faint">System</p>
              {SYSTEM_NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
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
            </>
          )}
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
        {/* Desktop header strip: the sidebar has no room for the bell, and it
            must stay reachable from every page. */}
        <div className="hidden md:flex items-center justify-end gap-2 px-8 py-2 border-b border-primary-100 bg-bg-card">
          <NotificationBell />
        </div>

        {/* Mobile top bar: just branding + the bell, nav lives in the bottom tab bar. */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-primary-100 bg-bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">TC</span>
            </div>
            <p className="text-sm font-semibold text-primary-900 truncate">TERECO Admin</p>
          </div>
          <NotificationBell />
        </div>
        <main className="flex-1 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 overflow-x-hidden">{children}</main>
      </div>

      <MobileTabBar
        tabs={NAV}
        moreItems={user?.role === 'super_admin' ? SYSTEM_NAV : []}
        onSignOut={() => { logout(); router.push('/auth'); }}
      />
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={ADMIN_ROLES}>
      <AdminShell>{children}</AdminShell>
    </PortalGate>
  );
}
