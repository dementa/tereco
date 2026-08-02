'use client';

import { Card } from '@/components/ui/Card';
import { useAuth } from '@/components/auth/AuthContext';
import { ChangePasswordCard } from '@/components/auth/ChangePasswordCard';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
};

export default function AdminAccountPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">My account</h1>
        <p className="text-sm text-text-muted">Your sign-in details for this portal.</p>
      </div>

      <Card>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-text-muted">Name</dt>
            <dd className="text-text-primary mt-0.5">{user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">Role</dt>
            <dd className="text-text-primary mt-0.5">
              {user ? ROLE_LABEL[user.role] ?? user.role : '—'}
            </dd>
          </div>
          {/* Email rather than system ID: the super admin has no system ID (see
              the identifier handling in /api/auth/login), and email is what they
              sign in with. */}
          <div className="min-w-0">
            <dt className="text-xs font-medium text-text-muted">Email</dt>
            <dd className="text-text-primary mt-0.5 truncate">{user?.email || '—'}</dd>
          </div>
        </dl>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
