'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import type { Role } from '@/lib/auth/session';

/**
 * Single role gate for every portal (/admin, /staff, /assessment). Bounces
 * anyone unauthenticated or wrong-role to /auth, which owns the one
 * role->destination map and re-routes them correctly from there — this
 * component never needs to know where a rejected visitor actually belongs.
 *
 * Callers must pass a module-level `roles` constant, not an inline array
 * literal, or the effect below reruns every render.
 */
export function PortalGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const allowed = isAuthenticated && !!user && roles.includes(user.role as Role);

  useEffect(() => {
    if (!loading && !allowed) router.replace('/auth');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, allowed]);

  if (loading || !allowed) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-muted">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
