'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import {
  LayoutDashboard, FileText, Users, GraduationCap, ClipboardList,
  CheckSquare, LogOut, ShieldAlert, ArrowLeft,
} from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/lessons', label: 'Lesson Submissions', icon: FileText },
  { href: '/admin/assessments', label: 'Assessments', icon: ClipboardList },
  { href: '/admin/marking', label: 'Marking', icon: CheckSquare },
  { href: '/admin/students', label: 'Students', icon: GraduationCap },
  { href: '/admin/users', label: 'Staff Users', icon: Users },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = React.useState(false);

  // AuthContext hydrates from localStorage in an effect; wait one tick.
  React.useEffect(() => {
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-muted">
        Loading admin…
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="max-w-md text-center bg-bg-card rounded-2xl p-8 border border-primary-100">
          <div className="w-14 h-14 rounded-full bg-error-bg flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-error" />
          </div>
          <h1 className="text-xl font-bold text-primary-900 mb-2">Admin access required</h1>
          <p className="text-sm text-text-muted mb-6">
            {isAuthenticated
              ? 'Your account does not have administrator privileges.'
              : 'Please sign in with an administrator account to continue.'}
          </p>
          <Button variant="primary" className="w-full" onClick={() => router.push('/')}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

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
        <nav className="flex-1 p-3 space-y-1">
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
          <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:bg-primary-50">
            <ArrowLeft className="w-4.5 h-4.5" /> Back to app
          </Link>
          <button
            onClick={() => { logout(); router.push('/'); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-error hover:bg-error-bg"
          >
            <LogOut className="w-4.5 h-4.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top nav */}
        <div className="md:hidden bg-bg-card border-b border-primary-100 p-3 flex items-center gap-2 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                  active ? 'bg-primary-700 text-white' : 'text-text-secondary bg-primary-50'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
