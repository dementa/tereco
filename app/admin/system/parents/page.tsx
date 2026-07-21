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
import { Ban, KeyRound, Link2, UserPlus, X } from 'lucide-react';

interface ParentAccount {
  id: string;
  systemId: string | null;
  name: string;
  contactEmail: string | null;
  photoUrl: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

interface StudentOption {
  id: string;
  systemId: string | null;
  name: string;
  className: string | null;
}

interface LinkedStudent {
  id: string;
  systemId: string | null;
  name: string;
  relationship: string | null;
  isPrimary: boolean;
  className: string | null;
}

interface NewCredentials {
  name: string;
  systemId: string;
  temporaryPassword: string;
  emailSent: boolean;
  emailError?: string;
  hasEmail: boolean;
}

const emptyForm = { name: '', email: '' };
const RELATIONSHIPS = ['mother', 'father', 'guardian'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function SystemParentsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<ParentAccount[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [newCredentials, setNewCredentials] = useState<NewCredentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [managing, setManaging] = useState<ParentAccount | null>(null);
  const [linked, setLinked] = useState<LinkedStudent[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linkForm, setLinkForm] = useState({
    studentId: '',
    relationship: 'guardian',
    isPrimary: false,
  });
  const [photoFor, setPhotoFor] = useState<ParentAccount | null>(null);

  const load = useCallback(async () => {
    try {
      const [parentsRes, studentsRes] = await Promise.all([
        fetch('/api/admin/system/parents').then((r) => r.json()),
        fetch('/api/admin/system/students').then((r) => r.json()),
      ]);
      if (parentsRes.success) setAccounts(parentsRes.data);
      else toast.error(parentsRes.message ?? 'Failed to load parents.');
      if (studentsRes.success) setStudents(studentsRes.data);
    } catch {
      toast.error('Network error while loading parents.');
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

  const loadLinks = useCallback(
    async (parentId: string) => {
      setLinksLoading(true);
      try {
        const res = await fetch(`/api/admin/system/parents/${parentId}/link-student`);
        const data = await res.json();
        if (data.success) setLinked(data.data);
        else toast.error(data.message ?? 'Failed to load linked students.');
      } catch {
        toast.error('Network error loading linked students.');
      } finally {
        setLinksLoading(false);
      }
    },
    [toast]
  );

  const openManage = useCallback(
    (parent: ParentAccount) => {
      setManaging(parent);
      setLinked([]);
      setLinkForm({ studentId: '', relationship: 'guardian', isPrimary: false });
      void loadLinks(parent.id);
    },
    [loadLinks]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/system/parents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setNewCredentials({ name: form.name, ...data.data });
        toast.success(`Parent account created for ${form.name}.`);
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

  async function handleResetPassword(account: ParentAccount) {
    if (!confirm(`Reset ${account.name}'s password?`)) return;
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

  async function handleDeactivate(account: ParentAccount) {
    if (!confirm(`Deactivate ${account.name}?`)) return;
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

  async function linkStudent() {
    if (!managing || !linkForm.studentId) return;
    const res = await fetch(`/api/admin/system/parents/${managing.id}/link-student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(linkForm),
    });
    const data = await res.json();
    if (data.success) {
      setLinkForm({ studentId: '', relationship: 'guardian', isPrimary: false });
      await loadLinks(managing.id);
      toast.success('Student linked.');
    } else {
      toast.error(data.message ?? 'Failed to link student.');
    }
  }

  async function unlinkStudent(student: LinkedStudent) {
    if (!managing) return;
    const res = await fetch(`/api/admin/system/parents/${managing.id}/link-student`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id }),
    });
    const data = await res.json();
    if (data.success) {
      await loadLinks(managing.id);
      toast.success(`${student.name} unlinked.`);
    } else {
      toast.error(data.message ?? 'Failed to unlink.');
    }
  }

  const columns: DataTableColumn<ParentAccount>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Parent',
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
            </span>
          </button>
        ),
      },
      { key: 'systemId', header: 'Parent ID', value: (a) => a.systemId ?? '—' },
      { key: 'contactEmail', header: 'Email', value: (a) => a.contactEmail ?? '—' },
      {
        key: 'actions',
        header: '',
        sortable: false,
        align: 'right',
        render: (a) => (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openManage(a)}
              title={`Manage children for ${a.name}`}
              className="p-1.5 rounded-lg text-[#02465B] hover:bg-[#F1F6F8]"
            >
              <Link2 className="w-4 h-4" aria-hidden />
            </button>
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
    [busyId, openManage]
  );

  // Children already linked shouldn't be offered again.
  const linkableStudents = useMemo(
    () => students.filter((s) => !linked.some((l) => l.id === s.id)),
    [students, linked]
  );

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Parents</h1>
        <p className="text-sm text-text-muted">
          Parent accounts are linked to one or more students. A parent&apos;s school is derived
          through their children, not stored on them.
        </p>
      </div>

      {newCredentials && (
        <CredentialsCard {...newCredentials} onDismiss={() => setNewCredentials(null)} />
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary-700" aria-hidden /> Add parent
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
            </div>
            <p className="text-xs text-text-muted">
              Link their children from the list once the account exists.
            </p>
            <Button type="submit" isLoading={creating}>
              Create parent
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
        searchPlaceholder="Search parents by name, ID or email…"
        emptyMessage="No parent accounts yet."
        mobileTitle={(a) => a.name}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Deactivated' },
            ],
            matches: (a, v) => (v === 'active' ? a.isActive : !a.isActive),
          },
        ]}
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <UserPlus className="w-4 h-4 mr-1.5" aria-hidden />
            New parent
          </Button>
        }
      />

      {managing && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">Children — {managing.name}</h2>
            <button type="button" onClick={() => setManaging(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>

          {linksLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <div className="space-y-2">
              {linked.length === 0 && (
                <p className="text-sm text-text-muted">No children linked yet.</p>
              )}

              {linked.map((student) => (
                <div
                  key={student.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E8EFF3] p-3"
                >
                  <span className="font-medium text-[#12333F]">{student.name}</span>
                  <span className="text-xs text-text-muted">{student.systemId}</span>
                  {student.className && <Badge variant="muted">{student.className}</Badge>}
                  {student.relationship && <Badge variant="default">{student.relationship}</Badge>}
                  {student.isPrimary && <Badge variant="success">Primary contact</Badge>}
                  <button
                    type="button"
                    onClick={() => void unlinkStudent(student)}
                    className="ml-auto text-[#C26565] hover:text-[#A34C4C]"
                    title={`Unlink ${student.name}`}
                  >
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              ))}

              <div className="pt-3 border-t border-[#F1F6F8] grid grid-cols-1 sm:grid-cols-4 gap-2 sm:items-end">
                <div className="sm:col-span-2">
                  <Select
                    label="Link a child"
                    options={[
                      { value: '', label: 'Select a student' },
                      ...linkableStudents.map((s) => ({
                        value: s.id,
                        label: `${s.name}${s.className ? ` — ${s.className}` : ''}`,
                      })),
                    ]}
                    value={linkForm.studentId}
                    onChange={(e) => setLinkForm({ ...linkForm, studentId: e.target.value })}
                  />
                </div>
                <Select
                  label="Relationship"
                  options={RELATIONSHIPS.map((r) => ({
                    value: r,
                    label: r[0].toUpperCase() + r.slice(1),
                  }))}
                  value={linkForm.relationship}
                  onChange={(e) => setLinkForm({ ...linkForm, relationship: e.target.value })}
                />
                <Button variant="outline" onClick={() => void linkStudent()}>
                  <Link2 className="w-4 h-4 mr-1.5" aria-hidden />
                  Link
                </Button>
                <label className="sm:col-span-4 flex items-center gap-2 text-sm text-[#12333F]">
                  <input
                    type="checkbox"
                    checked={linkForm.isPrimary}
                    onChange={(e) => setLinkForm({ ...linkForm, isPrimary: e.target.checked })}
                    className="rounded border-[#D1E0E8]"
                  />
                  Primary contact for this child
                </label>
              </div>
            </div>
          )}
        </Card>
      )}

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
