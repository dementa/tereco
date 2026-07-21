'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { CredentialsCard } from '@/components/admin/CredentialsCard';
import { useToast } from '@/components/ui/ToastProvider';
import { Ban, KeyRound, Upload, UserPlus, X } from 'lucide-react';

interface School {
  id: string;
  name: string;
}

interface Stream {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  level: number | null;
  alias: string | null;
  displayName: string;
  hasStreams: boolean;
  streams: Stream[];
}

interface StudentAccount {
  id: string;
  systemId: string | null;
  name: string;
  contactEmail: string | null;
  schoolName: string | null;
  gender: 'male' | 'female' | null;
  className: string | null;
  streamName: string | null;
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

const emptyForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  gender: '',
  email: '',
  schoolId: '',
  classId: '',
  streamId: '',
  dateOfBirth: '',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function SystemStudentsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [classesForSchool, setClassesForSchool] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [newCredentials, setNewCredentials] = useState<NewCredentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<StudentAccount | null>(null);

  const load = useCallback(async () => {
    try {
      const [studentsRes, schoolsRes] = await Promise.all([
        fetch('/api/admin/system/students').then((r) => r.json()),
        fetch('/api/admin/system/schools').then((r) => r.json()),
      ]);
      if (studentsRes.success) setAccounts(studentsRes.data);
      else toast.error(studentsRes.message ?? 'Failed to load students.');
      if (schoolsRes.success) setSchools(schoolsRes.data);
    } catch {
      toast.error('Network error while loading students.');
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

  // Classes belong to a school, so the class list is only meaningful once one
  // is chosen — and any previously picked class/stream must be cleared with it.
  async function chooseSchool(schoolId: string) {
    setForm((f) => ({ ...f, schoolId, classId: '', streamId: '' }));
    setClassesForSchool([]);
    if (!schoolId) return;
    try {
      const res = await fetch(`/api/admin/system/schools/${schoolId}/classes`);
      const data = await res.json();
      if (data.success) setClassesForSchool(data.data);
      else toast.error(data.message ?? 'Failed to load classes.');
    } catch {
      toast.error('Network error loading classes.');
    }
  }

  const selectedClass = classesForSchool.find((c) => c.id === form.classId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/system/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          middleName: form.middleName || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          streamId: form.streamId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const name = `${form.firstName} ${form.lastName}`.trim();
        setNewCredentials({ name, ...data.data });
        toast.success(`Student account created for ${name}.`);
        setForm(emptyForm);
        setClassesForSchool([]);
        setShowForm(false);
        await load();
      } else {
        toast.error(data.message ?? 'Failed to create student.');
      }
    } catch {
      toast.error('Network error — please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(account: StudentAccount) {
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

  async function handleDeactivate(account: StudentAccount) {
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

  const columns: DataTableColumn<StudentAccount>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Student',
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
      { key: 'systemId', header: 'Student ID', value: (a) => a.systemId ?? '—' },
      { key: 'schoolName', header: 'School', value: (a) => a.schoolName ?? '—' },
      {
        key: 'placement',
        header: 'Class',
        // Placement comes from the open enrolment, so a student between
        // enrolments legitimately has none.
        value: (a) => [a.className, a.streamName].filter(Boolean).join(' ') || '',
        render: (a) => {
          const label = [a.className, a.streamName].filter(Boolean).join(' ');
          return label ? (
            label
          ) : (
            <span className="text-[#9BB3BD]" title="No open enrolment">
              Not enrolled
            </span>
          );
        },
      },
      {
        key: 'gender',
        header: 'Gender',
        value: (a) => a.gender ?? '—',
        hideOnMobile: true,
      },
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

  const classOptions = useMemo(
    () =>
      classesForSchool.map((c) => ({
        value: c.id,
        label: c.displayName + (c.hasStreams ? ' (has streams)' : ''),
      })),
    [classesForSchool]
  );

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Student Accounts</h1>
        <p className="text-sm text-text-muted">
          Creating a student opens an enrolment for the chosen class — placement is a dated record,
          not a field on the student, so promotions and transfers never rewrite past results.
        </p>
      </div>

      {newCredentials && (
        <CredentialsCard {...newCredentials} onDismiss={() => setNewCredentials(null)} />
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary-700" aria-hidden /> Add student
            </h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="First name"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
              <Input
                label="Middle name"
                value={form.middleName}
                onChange={(e) => setForm({ ...form, middleName: e.target.value })}
              />
              <Input
                label="Last name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <Input
                label="Date of birth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
              <Input
                label="Email (optional)"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="School"
                options={[
                  { value: '', label: 'Select a school' },
                  ...schools.map((s) => ({ value: s.id, label: s.name })),
                ]}
                value={form.schoolId}
                onChange={(e) => void chooseSchool(e.target.value)}
                required
              />
              <Select
                label="Class"
                options={[{ value: '', label: 'Select a class' }, ...classOptions]}
                value={form.classId}
                disabled={!form.schoolId}
                onChange={(e) => setForm({ ...form, classId: e.target.value, streamId: '' })}
                required
              />
              <Select
                label={selectedClass?.hasStreams ? 'Stream' : 'Stream (none for this class)'}
                options={[
                  {
                    value: '',
                    label: selectedClass?.hasStreams ? 'Select a stream' : 'Not applicable',
                  },
                  ...(selectedClass?.streams ?? []).map((s) => ({ value: s.id, label: s.name })),
                ]}
                value={form.streamId}
                disabled={!selectedClass?.hasStreams}
                onChange={(e) => setForm({ ...form, streamId: e.target.value })}
                required={!!selectedClass?.hasStreams}
              />
            </div>

            <p className="text-xs text-text-muted">
              Students without an email get a placeholder identifier — they sign in with their
              Student ID either way. A photo can be added from the list once the account exists.
            </p>

            <Button type="submit" isLoading={creating}>
              Create student
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
        searchPlaceholder="Search by name, student ID, school or class…"
        emptyMessage="No student accounts yet. Add one, or use bulk import."
        mobileTitle={(a) => a.name}
        filters={[
          {
            key: 'school',
            label: 'School',
            options: schools.map((s) => ({ value: s.name, label: s.name })),
            matches: (a, v) => a.schoolName === v,
          },
          {
            key: 'class',
            label: 'Class',
            options: Array.from(
              new Set(accounts.map((a) => a.className).filter((c): c is string => !!c))
            )
              .sort()
              .map((c) => ({ value: c, label: c })),
            matches: (a, v) => a.className === v,
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Deactivated' },
              { value: 'unenrolled', label: 'Not enrolled' },
            ],
            matches: (a, v) =>
              v === 'active' ? a.isActive : v === 'inactive' ? !a.isActive : !a.className,
          },
        ]}
        actions={
          <>
            <Link href="/admin/system/students/import">
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-1.5" aria-hidden />
                Import
              </Button>
            </Link>
            <Button onClick={() => setShowForm((v) => !v)}>
              <UserPlus className="w-4 h-4 mr-1.5" aria-hidden />
              New student
            </Button>
          </>
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
