'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/components/auth/AuthContext';
import { KeyRound, Lock, Power, PowerOff, ShieldPlus, Trash2, X } from 'lucide-react';

// Kept in sync with ROOT_SUPER_ADMIN_EMAIL in lib/entities/accounts.ts — this
// one account can't be deactivated or deleted by anyone, so its row-level
// controls are disabled here too rather than only failing server-side.
const ROOT_SUPER_ADMIN_EMAIL = 'victordementa@gmail.com';

interface SuperAdminAccount {
  id: string;
  systemId: string | null;
  role: string;
  name: string;
  contactEmail: string | null;
  gender: 'male' | 'female' | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

interface NewCredentials {
  name: string;
  systemId: string | null;
  temporaryPassword: string;
  emailSent: boolean;
  emailError?: string;
  hasEmail: boolean;
}

const emptyForm = { name: '', email: '', gender: '' };

export default function SuperAdminsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<SuperAdminAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [newCredentials, setNewCredentials] = useState<NewCredentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system/super-admins').then((r) => r.json());
      if (res.success) setAccounts(res.data);
      else toast.error(res.message ?? 'Failed to load super admins.');
    } catch {
      toast.error('Network error while loading super admins.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/system/super-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, gender: form.gender || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setNewCredentials({ name: form.name, ...data.data });
        toast.success(`Super admin account created for ${form.name}.`);
        setForm(emptyForm);
        setShowForm(false);
        await load();
      } else {
        toast.error(data.message ?? 'Failed to create account.');
      }
    } catch {
      toast.error('Network error — please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(account: SuperAdminAccount) {
    if (!confirm(`Reset ${account.name}'s password? They'll need to set a new one on next login.`))
      return;
    setBusyId(account.id);
    try {
      const res = await fetch(`/api/admin/system/accounts/${account.id}/reset-password`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setNewCredentials({
          name: account.name,
          systemId: account.systemId,
          temporaryPassword: data.data.temporaryPassword,
          emailSent: false,
          hasEmail: !!account.contactEmail,
        });
        await load();
        toast.success(`Password reset for ${account.name}.`);
      } else {
        toast.error(data.message ?? 'Reset failed.');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(account: SuperAdminAccount) {
    const next = !account.isActive;
    const res = await fetch(`/api/admin/system/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    });
    const data = await res.json();
    if (data.success) {
      setAccounts((current) =>
        current.map((a) => (a.id === account.id ? { ...a, isActive: next } : a))
      );
      toast.success(`${account.name} ${next ? 'reactivated' : 'deactivated'}.`);
    } else {
      // Refused when this would leave zero active super admins.
      toast.error(data.message ?? 'Failed to update account.');
    }
  }

  async function removeAccount(account: SuperAdminAccount) {
    if (!confirm(`Permanently delete ${account.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/system/accounts/${account.id}?hard=true`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.success) {
      setAccounts((current) => current.filter((a) => a.id !== account.id));
      toast.success(`${account.name} deleted.`);
    } else {
      // Refused when the account holds history, or is the last super admin.
      toast.error(data.message ?? 'Failed to delete account.');
    }
  }

  const columns: DataTableColumn<SuperAdminAccount>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        value: (a) => a.name,
        render: (a) => (
          <span className="min-w-0">
            <span className="font-medium block truncate">
              {a.name}
              {a.id === user?.id && <span className="text-text-muted font-normal"> (you)</span>}
            </span>
            {a.contactEmail === ROOT_SUPER_ADMIN_EMAIL && <Badge variant="default">Root — protected</Badge>}
            {!a.isActive && <Badge variant="muted">Deactivated</Badge>}
            {a.mustChangePassword && a.isActive && <Badge variant="accent">Pending first login</Badge>}
          </span>
        ),
      },
      { key: 'contactEmail', header: 'Email', value: (a) => a.contactEmail ?? '—' },
      { key: 'gender', header: 'Gender', value: (a) => a.gender ?? '—', hideOnMobile: true },
      {
        key: 'actions',
        header: '',
        sortable: false,
        align: 'right',
        render: (a) => {
          const protectedRoot = a.contactEmail === ROOT_SUPER_ADMIN_EMAIL;
          return (
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => void handleResetPassword(a)}
                disabled={busyId === a.id}
                title={`Reset password for ${a.name}`}
                className="p-1.5 rounded-lg text-[#02465B] hover:bg-[#F1F6F8] disabled:opacity-40"
              >
                <KeyRound className="w-4 h-4" aria-hidden />
              </button>
              {protectedRoot ? (
                <span
                  title="The root super admin account can't be deactivated or deleted"
                  className="p-1.5 rounded-lg text-[#9BB0B8]"
                >
                  <Lock className="w-4 h-4" aria-hidden />
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void toggleActive(a)}
                    title={a.isActive ? `Deactivate ${a.name}` : `Reactivate ${a.name}`}
                    className="p-1.5 rounded-lg text-[#5A7D8A] hover:bg-[#F1F6F8]"
                  >
                    {a.isActive ? <PowerOff className="w-4 h-4" aria-hidden /> : <Power className="w-4 h-4" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeAccount(a)}
                    title={`Delete ${a.name}`}
                    className="p-1.5 rounded-lg text-[#C26565] hover:bg-[#FBF0F0]"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId, user?.id]
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Super Admins</h1>
        <p className="text-sm text-text-muted">
          Full system access — no school scope, no System ID, sign in by email. There is no cap on
          how many can exist, but at least one active super admin must always remain.
        </p>
      </div>

      {newCredentials && (
        <CredentialsCard {...newCredentials} onDismiss={() => setNewCredentials(null)} />
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900 flex items-center gap-2">
              <ShieldPlus className="w-5 h-5 text-primary-700" aria-hidden /> Add super admin
            </h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
              <Select
                label="Gender"
                options={[
                  { value: '', label: 'Not recorded' },
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ]}
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              />
            </div>
            <p className="text-xs text-text-muted">
              They sign in with this email and the generated password below, and are required to
              set a new password on first login.
            </p>
            <Button type="submit" isLoading={creating}>
              Create account
            </Button>
          </form>
        </Card>
      )}

      <DataTable
        rows={accounts}
        columns={columns}
        rowKey={(a) => a.id}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search by name or email…"
        emptyMessage="No super admin accounts yet."
        mobileTitle={(a) => a.name}
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <ShieldPlus className="w-4 h-4 mr-1.5" aria-hidden />
            New super admin
          </Button>
        }
      />
    </div>
  );
}
