'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChangePasswordScreen } from '@/components/auth/ChangePasswordScreen';
import { useAuth } from '@/components/auth/AuthContext';
import { PORTAL_FOR_ROLE } from '@/lib/auth/portals';
import type { Role } from '@/lib/auth/session';

export default function AuthChangePasswordPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading, refresh } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/auth');
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-muted">
        Loading…
      </div>
    );
  }

  const handleDone = async () => {
    const destination = PORTAL_FOR_ROLE[user.role as Role] ?? '/auth';
    await refresh(); // clears mustChangePassword in context
    router.replace(destination);
  };

  return <ChangePasswordScreen onDone={handleDone} />;
}
