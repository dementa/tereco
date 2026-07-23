'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type User } from '@/components/auth/AuthContext';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { Button } from '@/components/ui/Button';
import { PORTAL_FOR_ROLE } from '@/lib/auth/portals';
import type { Role } from '@/lib/auth/session';

function destinationFor(user: User): string | null {
  return PORTAL_FOR_ROLE[user.role as Role] ?? null;
}

export default function AuthPage() {
  const { user, isAuthenticated, loading, mustChangePassword, logout } = useAuth();
  const router = useRouter();

  // Someone already signed in never sees the form — they're bounced straight
  // to their portal (or to the forced password change first). Students get
  // the skippable version at /assessment/change-password (a timed paper
  // shouldn't wait on this); everyone else gets the non-skippable one.
  useEffect(() => {
    if (loading || !isAuthenticated || !user) return;
    if (mustChangePassword) {
      router.replace(user.role === 'student' ? '/assessment/change-password' : '/auth/change-password');
      return;
    }
    const destination = destinationFor(user);
    if (destination) router.replace(destination);
  }, [loading, isAuthenticated, user, mustChangePassword, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-muted">
        Loading…
      </div>
    );
  }

  if (isAuthenticated && user) {
    // mustChangePassword or a known destination both redirect above — this
    // only renders for a role with no portal (e.g. parent).
    if (mustChangePassword || destinationFor(user)) return null;

    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="max-w-md text-center bg-bg-card rounded-2xl p-8 border border-primary-100">
          <h1 className="text-xl font-bold text-primary-900 mb-2">No portal available</h1>
          <p className="text-sm text-text-muted mb-6">
            Your account doesn&apos;t have a portal set up yet. Contact an administrator.
          </p>
          <Button variant="primary" className="w-full" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const handleLogin = (loggedInUser: User & { mustChangePassword?: boolean }) => {
    if (loggedInUser.mustChangePassword) {
      router.replace(
        loggedInUser.role === 'student' ? '/assessment/change-password' : '/auth/change-password'
      );
      return;
    }
    router.replace(destinationFor(loggedInUser) ?? '/auth');
  };

  return <LoginScreen onLogin={handleLogin} />;
}
