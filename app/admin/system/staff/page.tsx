'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { Ban, KeyRound, UserPlus, X } from 'lucide-react';

interface School {
  id: string;
  name: string;
}

interface StaffAccount {
  id: string;
  systemId: string | null;
  role: string;
  name: string;
  contactEmail: string | null;
  schoolName: string | null;
  gender: 'male' | 'female' | null;
  photoUrl: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

interface NewCredentials {
  name: string;
  systemId: string;
  temporaryPassword: string;
  emailSent: boolean;
  emailError?: string;
  hasEmail: boolean;
}

const emptyForm = { role: 'staff', name: '', email: '', schoolId: '', gender: '' };

/** Initials fallback, so a row without a photo still reads as a person. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function SystemStaffPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [newCredentials, setNewCredentials] = useState<NewCredentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<StaffAccount | null>(null);

  const load = useCallback(async () => {
    try {
      const [staffRes, schoolsRes] = await Promise.all([
        fetch('/api/admin/system/staff').then((r) => r.json()),
        fetch('/api/admin/system/schools').then((r) => r.json()),
      ]);
      if (staffRes.success) setAccounts(staffRes.data);
      else toast.error(staffRes.message ?? 'Failed to load accounts.');
      if (schoolsRes.success) setSchools(schoolsRes.data);
    } catch {
      toast.error('Network error while loading accounts.');
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
      const res = await fetch('/api/admin/system/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          schoolId: form.schoolId || undefined,
          gender: form.gender || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewCredentials({ name: form.name, ...data.data });
        toast.success(
          `${form.role === 'admin' ? 'Admin' : 'Staff'} account created for ${form.name}.`
        );
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

  async function handleResetPassword(account: StaffAccount) {
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
          systemId: account.systemId ?? '',
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

  async function handleDeactivate(account: StaffAccount) {
    if (!confirm(`Deactivate ${account.name}? They will no longer be able to log in.`)) return;
    setBusyId(account.id);
    try {
      const res = await fetch(`/api/admin/system/accounts/${account.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await load();
        toast.success(`${account.name} deactivated.`);
      } else {
        toast.error(data.message ?? 'Failed to deactivate.');
      }
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataTableColumn<StaffAccount>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        value: (a) => a.name,
        render: (a) => (
          <button
            type="button"
            onClick={() => setPhotoFor(a)}
            className="flex items-center gap-2.5 text-left group"
            title="Change photo"
          >
            {a.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.photoUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover border border-[#E8EFF3] shrink-0"
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-[#F1F6F8] text-[#5A7D8A] text-xs font-medium flex items-center justify-center shrink-0 group-hover:bg-[#E8EFF3]">
                {initials(a.name) || '—'}
              </span>
            )}
            <span className="min-w-0">
              <span className="font-medium block truncate">{a.name}</span>
              {!a.isActive && <Badge variant="muted">Deactivated</Badge>}
              {a.mustChangePassword && a.isActive && (
                <Badge variant="accent">Pending first login</Badge>
              )}
            </span>
          </button>
        ),
      },
      { key: 'systemId', header: 'System ID', value: (a) => a.systemId ?? '—' },
      { key: 'role', header: 'Role', value: (a) => a.role },
      { key: 'schoolName', header: 'School', value: (a) => a.schoolName ?? '—' },
      {
        key: 'contactEmail',
        header: 'Email',
        value: (a) => a.contactEmail ?? '—',
        hideOnMobile: true,
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        align: 'right',
        render: (a) => (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => void handleResetPassword(a)}
              disabled={busyId === a.id}
              title={`Reset password for ${a.name}`}
              className="p-1.5 rounded-lg text-[#02465B] hover:bg-[#F1F6F8] disabled:opacity-40"
            >
              <KeyRound className="w-4 h-4" aria-hidden />
            </button>
            {a.isActive && (
              <button
                type="button"
                onClick={() => void handleDeactivate(a)}
                disabled={busyId === a.id}
                title={`Deactivate ${a.name}`}
                className="p-1.5 rounded-lg text-[#C26565] hover:bg-[#FBF0F0] disabled:opacity-40"
              >
                <Ban className="w-4 h-4" aria-hidden />
              </button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId]
  );

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Staff &amp; Admins</h1>
        <p className="text-sm text-text-muted">
          Accounts get a system-generated ID and password — there are no signups. Admins are
          TERECO-wide; staff belong to a school.
        </p>
      </div>

      {newCredentials && (
        <CredentialsCard {...newCredentials} onDismiss={() => setNewCredentials(null)} />
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary-700" aria-hidden /> Add staff or admin
            </h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Role"
                options={[
                  { value: 'staff', label: 'Staff' },
                  { value: 'admin', label: 'Admin' },
                ]}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                required
              />
              <Select
                label={form.role === 'admin' ? 'School (admins are TERECO-wide)' : 'School'}
                options={[
                  { value: '', label: 'None' },
                  ...schools.map((s) => ({ value: s.id, label: s.name })),
                ]}
                value={form.schoolId}
                disabled={form.role === 'admin'}
                onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
              />
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
              A photo can be added from the list once the account exists.
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
        searchPlaceholder="Search by name, ID, email or school…"
        emptyMessage="No staff or admin accounts yet."
        mobileTitle={(a) => a.name}
        filters={[
          {
            key: 'role',
            label: 'Role',
            options: [
              { value: 'staff', label: 'Staff' },
              { value: 'admin', label: 'Admin' },
            ],
            matches: (a, v) => a.role === v,
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Deactivated' },
              { value: 'pending', label: 'Pending first login' },
            ],
            matches: (a, v) =>
              v === 'active'
                ? a.isActive
                : v === 'inactive'
                  ? !a.isActive
                  : a.isActive && a.mustChangePassword,
          },
          {
            key: 'school',
            label: 'School',
            options: schools.map((s) => ({ value: s.name, label: s.name })),
            matches: (a, v) => a.schoolName === v,
          },
        ]}
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <UserPlus className="w-4 h-4 mr-1.5" aria-hidden />
            New account
          </Button>
        }
      />

      {photoFor && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">Photo — {photoFor.name}</h2>
            <button type="button" onClick={() => setPhotoFor(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <ImageUpload
            kind="profile"
            entityId={photoFor.id}
            value={photoFor.photoUrl}
            label="Identity photo"
            onChange={(url) => {
              setPhotoFor({ ...photoFor, photoUrl: url });
              setAccounts((current) =>
                current.map((a) => (a.id === photoFor.id ? { ...a, photoUrl: url } : a))
              );
            }}
          />
        </Card>
      )}
    </div>
  );
}
