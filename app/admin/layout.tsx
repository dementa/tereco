'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import {
  LayoutDashboard, FileText, GraduationCap, ClipboardList,
  CheckSquare, LogOut, School, UserCog, Contact, CalendarDays, ShieldCheck, TrendingUp, Library,
  UserCircle,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';

// The old /admin/students and /admin/users roster pages are gone: they were the
// pre-Supabase-Auth surface, built on the dropped `students`/`users` tables and
// a hardcoded school list. Their replacements are under System below.
const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/lessons', label: 'Lesson Submissions', icon: FileText },
  { href: '/admin/assessments', label: 'Assessments', icon: ClipboardList },
  { href: '/admin/marking', label: 'Marking', icon: CheckSquare },
  // Both admin and super_admin may author Library content with full
  // audience control (lib/auth/access.ts canManageLibraryContent) — only
  // approving someone else's submission is super_admin-only, which is why
  // that lives under System below instead of here.
  { href: '/admin/library', label: 'Library', icon: Library },
  { href: '/admin/performance', label: 'Performance', icon: TrendingUp },
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
  { href: '/admin/system/super-admins', label: 'Super Admins', icon: ShieldCheck },
  { href: '/admin/system/library', label: 'System Library', icon: Library },
];

// Own-account settings — kept out of NAV and pinned beside Sign out, since it
// is about the person signed in rather than the work they came here to do.
// Available to every role that can reach this portal: an admin locked out of
// their own password would be a strange thing to ship.
const ACCOUNT_NAV = [
  { href: '/admin/account', label: 'My Account', icon: UserCircle },
];

const ADMIN_ROLES: Role[] = ['admin', 'super_admin'];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex">
      <aside className="w-60 shrink-0 bg-bg-card border-r border-border hidden md:flex flex-col sticky top-0 h-screen print:hidden">
        <div className="p-5 flex items-center gap-3 border-b border-border">
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-primary-700 text-white'
                    : 'text-text-secondary hover:bg-bg-muted'
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
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-primary-700 text-white'
                        : 'text-text-secondary hover:bg-bg-muted'
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
        <div className="p-3 border-t border-border space-y-1">
          {ACCOUNT_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-primary-700 text-white'
                    : 'text-text-secondary hover:bg-bg-muted'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => { logout(); router.push('/auth'); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-error hover:bg-error-bg"
          >
            <LogOut className="w-4.5 h-4.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop header strip: the sidebar has no room for the bell, and it
            must stay reachable from every page. */}
        <div className="hidden md:flex items-center justify-end gap-2 px-8 py-2 border-b border-border bg-bg-card print:hidden">
          <NotificationBell />
        </div>

        {/* Mobile top bar: hamburger + branding + the bell; nav lives in the drawer. */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavDrawer
              title="TERECO Admin"
              subtitle={user?.name}
              items={NAV}
              secondaryItems={user?.role === 'super_admin' ? SYSTEM_NAV : []}
              footerItems={ACCOUNT_NAV}
              onSignOut={() => { logout(); router.push('/auth'); }}
            />
            <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">TC</span>
            </div>
            <p className="text-sm font-semibold text-primary-900 truncate">TERECO Admin</p>
          </div>
          <NotificationBell />
        </div>
        <main className="flex-1 p-3 sm:p-6 md:p-8 print:p-0">{children}</main>
      </div>
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
