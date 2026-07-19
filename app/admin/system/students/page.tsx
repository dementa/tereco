'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { UserPlus, KeyRound, Ban, Upload } from 'lucide-react';

interface School { id: string; name: string; }
interface Stream { id: string; name: string; }
interface SchoolClass { id: string; name: string; hasStreams: boolean; streams: Stream[]; }
interface StudentAccount {
  id: string;
  systemId: string | null;
  name: string;
  contactEmail: string | null;
  schoolName: string | null;
  className: string | null;
  streamName: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
}
interface NewCredentials {
  name: string; systemId: string; temporaryPassword: string;
  emailSent: boolean; emailError?: string; hasEmail: boolean;
}

const emptyForm = {
  firstName: '', middleName: '', lastName: '', email: '',
  schoolId: '', classId: '', streamId: '', dateOfBirth: '',
};

export default function SystemStudentsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [classesForSchool, setClassesForSchool] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [newCredentials, setNewCredentials] = useState<NewCredentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/system/students')
      .then((r) => r.json())
      .then((d) => { if (d.success) setAccounts(d.data); else setError(d.message || 'Failed to load'); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch('/api/admin/system/schools').then((r) => r.json()).then((d) => { if (d.success) setSchools(d.data); });
  }, []);

  const handleSchoolChange = (schoolId: string) => {
    setForm({ ...form, schoolId, classId: '', streamId: '' });
    setClassesForSchool([]);
    if (!schoolId) return;
    fetch(`/api/admin/system/schools/${schoolId}/classes`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setClassesForSchool(d.data); });
  };

  const selectedClass = classesForSchool.find((c) => c.id === form.classId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/system/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          streamId: form.streamId || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
        }),
      });
      const data = await res.json();
      const fullName = [form.firstName, form.lastName].filter(Boolean).join(' ');
      if (data.success) {
        setNewCredentials({ name: fullName, ...data.data });
        setForm(emptyForm);
        setClassesForSchool([]);
        load();
        toast.success(`Student account created for ${fullName}.`);
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

  const handleResetPassword = async (account: StudentAccount) => {
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

  const handleDeactivate = async (account: StudentAccount) => {
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

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-primary-900">Student Accounts</h1>
        <a href="/admin/system/students/import">
          <Button variant="outline"><Upload className="w-4 h-4 mr-1.5" /> Bulk import</Button>
        </a>
      </div>
      <p className="text-sm text-text-muted mb-6">
        Login-capable accounts (required to take assessments). Email is optional — students without one yet log in with just their System ID and password.
      </p>

      {newCredentials && (
        <CredentialsCard {...newCredentials} onDismiss={() => setNewCredentials(null)} />
      )}

      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary-700" /> Add student account
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            <Input label="Middle name (optional)" value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
            <Input label="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Date of birth (optional)" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            <Select
              label="School"
              options={[{ value: '', label: 'Select a school…' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]}
              value={form.schoolId}
              onChange={(e) => handleSchoolChange(e.target.value)}
              required
            />
            <Select
              label="Class"
              options={[{ value: '', label: form.schoolId ? 'Select a class…' : 'Select a school first' }, ...classesForSchool.map((c) => ({ value: c.id, label: c.name }))]}
              value={form.classId}
              onChange={(e) => setForm({ ...form, classId: e.target.value, streamId: '' })}
              disabled={!form.schoolId}
              required
            />
            {selectedClass?.hasStreams && (
              <Select
                label="Stream"
                options={[{ value: '', label: 'Select a stream…' }, ...selectedClass.streams.map((s) => ({ value: s.id, label: s.name }))]}
                value={form.streamId}
                onChange={(e) => setForm({ ...form, streamId: e.target.value })}
                required
              />
            )}
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
        <p className="text-text-muted">No student accounts yet.</p>
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
                  {a.systemId} • {a.contactEmail ?? 'No email on file'}{a.schoolName ? ` • ${a.schoolName}` : ''}{a.className ? ` • ${a.className}` : ''}{a.streamName ? ` ${a.streamName}` : ''}
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
