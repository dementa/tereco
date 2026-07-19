'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { UserPlus, KeyRound, Ban, Link2, X } from 'lucide-react';

interface ParentAccount {
  id: string;
  systemId: string | null;
  name: string;
  contactEmail: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
}
interface StudentOption { id: string; systemId: string | null; name: string; }
interface NewCredentials {
  name: string; systemId: string; temporaryPassword: string;
  emailSent: boolean; emailError?: string; hasEmail: boolean;
}

const emptyForm = { name: '', email: '' };

export default function SystemParentsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<ParentAccount[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [newCredentials, setNewCredentials] = useState<NewCredentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [linkedByParent, setLinkedByParent] = useState<Record<string, StudentOption[]>>({});
  const [loadingLinksFor, setLoadingLinksFor] = useState<string | null>(null);
  const [linkStudentId, setLinkStudentId] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/system/parents')
      .then((r) => r.json())
      .then((d) => { if (d.success) setAccounts(d.data); else setError(d.message || 'Failed to load'); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch('/api/admin/system/students').then((r) => r.json()).then((d) => { if (d.success) setStudents(d.data); });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
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
        setForm(emptyForm);
        load();
        toast.success(`Parent account created for ${form.name}.`);
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

  const handleResetPassword = async (account: ParentAccount) => {
    if (!confirm(`Reset ${account.name}'s password?`)) return;
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

  const handleDeactivate = async (account: ParentAccount) => {
    if (!confirm(`Deactivate ${account.name}?`)) return;
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

  const openManageLinks = async (parentId: string) => {
    setManagingId(managingId === parentId ? null : parentId);
    setLinkStudentId('');
    if (!linkedByParent[parentId]) {
      setLoadingLinksFor(parentId);
      try {
        const res = await fetch(`/api/admin/system/parents/${parentId}/link-student`);
        const data = await res.json();
        if (data.success) {
          setLinkedByParent((prev) => ({ ...prev, [parentId]: data.data }));
        } else {
          toast.error(data.message || 'Failed to load linked students.');
        }
      } catch {
        toast.error('Network error loading linked students.');
      } finally {
        setLoadingLinksFor((current) => (current === parentId ? null : current));
      }
    }
  };

  const handleLink = async (parentId: string) => {
    if (!linkStudentId) return;
    const res = await fetch(`/api/admin/system/parents/${parentId}/link-student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: linkStudentId }),
    });
    const data = await res.json();
    if (data.success) {
      const linked = await fetch(`/api/admin/system/parents/${parentId}/link-student`).then((r) => r.json());
      if (linked.success) setLinkedByParent((prev) => ({ ...prev, [parentId]: linked.data }));
      setLinkStudentId('');
      toast.success('Student linked.');
    } else {
      toast.error(data.message || 'Failed to link student.');
    }
  };

  const handleUnlink = async (parentId: string, studentId: string) => {
    const res = await fetch(`/api/admin/system/parents/${parentId}/link-student`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    });
    const data = await res.json();
    if (data.success) {
      setLinkedByParent((prev) => ({ ...prev, [parentId]: (prev[parentId] ?? []).filter((s) => s.id !== studentId) }));
      toast.success('Student unlinked.');
    } else {
      toast.error(data.message || 'Failed to unlink student.');
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Parents</h1>
      <p className="text-sm text-text-muted mb-6">Account + student linking only — no parent-facing portal yet.</p>

      {newCredentials && (
        <CredentialsCard {...newCredentials} onDismiss={() => setNewCredentials(null)} />
      )}

      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary-700" /> Add parent
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button type="submit" isLoading={creating}>Create account</Button>
        </form>
      </Card>

      <h2 className="text-lg font-semibold text-primary-900 mb-4">Existing parents</h2>
      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-error">{error}</p>
      ) : accounts.length === 0 ? (
        <p className="text-text-muted">No parent accounts yet.</p>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-primary-900 truncate flex items-center gap-2">
                    {a.name}
                    {!a.isActive && <Badge variant="muted">Deactivated</Badge>}
                    {a.mustChangePassword && a.isActive && <Badge variant="accent">Pending first login</Badge>}
                  </p>
                  <p className="text-xs text-text-muted truncate">{a.systemId} • {a.contactEmail ?? 'No email on file'}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" onClick={() => openManageLinks(a.id)}>
                    <Link2 className="w-4 h-4 mr-1" /> Students
                  </Button>
                  <Button variant="outline" onClick={() => handleResetPassword(a)} disabled={busyId === a.id}>
                    <KeyRound className="w-4 h-4" />
                  </Button>
                  {a.isActive && (
                    <Button variant="outline" className="text-error border-error/20 hover:bg-error-bg" onClick={() => handleDeactivate(a)} disabled={busyId === a.id}>
                      <Ban className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {managingId === a.id && (
                <div className="mt-4 pt-4 border-t border-primary-100">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {loadingLinksFor === a.id ? (
                      <p className="text-xs text-text-muted">Loading linked students…</p>
                    ) : (linkedByParent[a.id] ?? []).length === 0 ? (
                      <p className="text-xs text-text-muted">No linked students yet.</p>
                    ) : (
                      linkedByParent[a.id].map((s) => (
                        <span key={s.id} className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-800 text-xs px-2.5 py-1 rounded-lg">
                          {s.name}
                          <button onClick={() => handleUnlink(a.id, s.id)} aria-label={`Unlink ${s.name}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select
                        options={[{ value: '', label: 'Select a student to link…' }, ...students.map((s) => ({ value: s.id, label: `${s.name} (${s.systemId ?? ''})` }))]}
                        value={linkStudentId}
                        onChange={(e) => setLinkStudentId(e.target.value)}
                      />
                    </div>
                    <Button variant="outline" onClick={() => handleLink(a.id)} disabled={!linkStudentId}>Link</Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
