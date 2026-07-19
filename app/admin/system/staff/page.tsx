'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { UserPlus, KeyRound, Ban } from 'lucide-react';

interface School { id: string; name: string; }
interface StaffAccount {
  id: string;
  systemId: string | null;
  role: string;
  name: string;
  contactEmail: string | null;
  schoolName: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
}
interface NewCredentials {
  name: string; systemId: string; temporaryPassword: string;
  emailSent: boolean; emailError?: string; hasEmail: boolean;
}

const emptyForm = { role: 'staff', name: '', email: '', schoolId: '' };

export default function SystemStaffPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [newCredentials, setNewCredentials] = useState<NewCredentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/system/staff')
      .then((r) => r.json())
      .then((d) => { if (d.success) setAccounts(d.data); else setError(d.message || 'Failed to load'); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch('/api/admin/system/schools').then((r) => r.json()).then((d) => { if (d.success) setSchools(d.data); });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/system/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, schoolId: form.schoolId || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setNewCredentials({ name: form.name, ...data.data });
        setForm(emptyForm);
        load();
        toast.success(`${form.role === 'admin' ? 'Admin' : 'Staff'} account created for ${form.name}.`);
      } else {
        setFormError(data.message || 'Failed to create account');
        toast.error(data.message || 'Failed to create account.');
      }
    } catch {
      setFormError('Network error');
      toast.error('Network error — please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (account: StaffAccount) => {
    if (!confirm(`Reset ${account.name}'s password? They'll need to set a new one on next login.`)) return;
    setBusyId(account.id);
    try {
      const res = await fetch(`/api/admin/system/accounts/${account.id}/reset-password`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setNewCredentials({ name: account.name, systemId: account.systemId ?? '', temporaryPassword: data.data.temporaryPassword, emailSent: false, hasEmail: !!account.contactEmail });
        load();
        toast.success(`Password reset for ${account.name}.`);
      } else {
        toast.error(data.message || 'Reset failed.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDeactivate = async (account: StaffAccount) => {
    if (!confirm(`Deactivate ${account.name}? They will no longer be able to log in.`)) return;
    setBusyId(account.id);
    try {
      const res = await fetch(`/api/admin/system/accounts/${account.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        load();
        toast.success(`${account.name} deactivated.`);
      } else {
        toast.error(data.message || 'Failed to deactivate.');
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Staff & Admins</h1>
      <p className="text-sm text-text-muted mb-6">Create accounts with system-generated IDs and passwords. No signups.</p>

      {newCredentials && (
        <CredentialsCard {...newCredentials} onDismiss={() => setNewCredentials(null)} />
      )}

      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary-700" /> Add staff or admin
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Role"
              options={[{ value: 'staff', label: 'Staff' }, { value: 'admin', label: 'Admin' }]}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              required
            />
            <Select
              label="School (optional)"
              options={[{ value: '', label: 'None' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]}
              value={form.schoolId}
              onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
            />
            <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button type="submit" isLoading={creating}>Create account</Button>
        </form>
      </Card>

      <h2 className="text-lg font-semibold text-primary-900 mb-4">Existing accounts</h2>
      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-error">{error}</p>
      ) : accounts.length === 0 ? (
        <p className="text-text-muted">No accounts yet.</p>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <Card key={a.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-primary-900 truncate flex items-center gap-2">
                  {a.name}
                  {!a.isActive && <Badge variant="muted">Deactivated</Badge>}
                  {a.mustChangePassword && a.isActive && <Badge variant="accent">Pending first login</Badge>}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {a.role} • {a.systemId} • {a.contactEmail ?? 'No email on file'}{a.schoolName ? ` • ${a.schoolName}` : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => handleResetPassword(a)} disabled={busyId === a.id}>
                  <KeyRound className="w-4 h-4" />
                </Button>
                {a.isActive && (
                  <Button variant="outline" className="text-error border-error/20 hover:bg-error-bg" onClick={() => handleDeactivate(a)} disabled={busyId === a.id}>
                    <Ban className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
