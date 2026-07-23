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
import { ArrowRightLeft, Check, Eye, KeyRound, Pencil, Power, PowerOff, Trash2, Upload, UserPlus, X } from 'lucide-react';

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

interface EnrollmentHistoryEntry {
  id: string;
  schoolName: string;
  className: string;
  streamName: string | null;
  academicYear: string;
  status: string;
  enrolledOn: string;
  exitedOn: string | null;
  exitReason: string | null;
}

const MOVES = [
  { value: 'promote', label: 'Promote to the next class' },
  { value: 'transfer', label: 'Transfer to another class or school' },
  { value: 'repeat', label: 'Repeat the year' },
  { value: 'withdraw', label: 'Withdraw from the programme' },
];

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

interface StudentRequest {
  id: string;
  requestedByName: string;
  schoolName: string;
  classDisplayName: string;
  streamName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: 'male' | 'female' | null;
  note: string;
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

const VIEW_FIELDS: [string, (a: StudentAccount) => string][] = [
  ['Student ID', (a) => a.systemId ?? ''],
  ['School', (a) => a.schoolName ?? ''],
  ['Class', (a) => [a.className, a.streamName].filter(Boolean).join(' ')],
  ['Email', (a) => a.contactEmail ?? ''],
  ['Gender', (a) => a.gender ?? ''],
  ['Status', (a) => (a.isActive ? 'Active' : 'Deactivated')],
  ['Created', (a) => new Date(a.createdAt).toLocaleDateString()],
];

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
  const [requests, setRequests] = useState<StudentRequest[]>([]);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [newCredentials, setNewCredentials] = useState<NewCredentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<StudentAccount | null>(null);
  const [editing, setEditing] = useState<StudentAccount | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [photoFor, setPhotoFor] = useState<StudentAccount | null>(null);
  const [moving, setMoving] = useState<StudentAccount | null>(null);
  const [history, setHistory] = useState<EnrollmentHistoryEntry[]>([]);
  const [moveClasses, setMoveClasses] = useState<SchoolClass[]>([]);
  const [moveForm, setMoveForm] = useState({
    move: 'promote',
    effectiveDate: new Date().toISOString().slice(0, 10),
    schoolId: '',
    classId: '',
    streamId: '',
    reason: '',
  });
  const [movingBusy, setMovingBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [studentsRes, schoolsRes, requestsRes] = await Promise.all([
        fetch('/api/admin/system/students').then((r) => r.json()),
        fetch('/api/admin/system/schools').then((r) => r.json()),
        fetch('/api/student-requests').then((r) => r.json()),
      ]);
      if (studentsRes.success) setAccounts(studentsRes.data);
      else toast.error(studentsRes.message ?? 'Failed to load students.');
      if (schoolsRes.success) setSchools(schoolsRes.data);
      if (requestsRes.success) setRequests(requestsRes.data);
    } catch {
      toast.error('Network error while loading students.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  async function approveRequest(r: StudentRequest) {
    setRequestBusyId(r.id);
    try {
      const res = await fetch(`/api/student-requests/${r.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRequests((current) => current.filter((x) => x.id !== r.id));
        toast.success(`${r.firstName} ${r.lastName} added.`);
        await load();
      } else {
        toast.error(data.message ?? 'Failed to approve request.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setRequestBusyId(null);
    }
  }

  async function rejectRequest(r: StudentRequest) {
    const reason = window.prompt(`Reason for declining ${r.firstName} ${r.lastName}?`);
    if (!reason) return;
    setRequestBusyId(r.id);
    try {
      const res = await fetch(`/api/student-requests/${r.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        setRequests((current) => current.filter((x) => x.id !== r.id));
        toast.success('Request declined.');
      } else {
        toast.error(data.message ?? 'Failed to decline request.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setRequestBusyId(null);
    }
  }

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


  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    try {
      const [firstName, ...rest] = editing.name.trim().split(/\s+/);
      const res = await fetch(`/api/admin/system/accounts/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName: rest.join(' '),
          contactEmail: editing.contactEmail ?? '',
          gender: editing.gender,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAccounts((current) =>
          current.map((a) => (a.id === editing.id ? editing : a))
        );
        setEditing(null);
        toast.success('Account updated.');
      } else {
        toast.error(data.message ?? 'Failed to update account.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(account: StudentAccount) {
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
      toast.error(data.message ?? 'Failed to update account.');
    }
  }

  async function removeAccount(account: StudentAccount) {
    if (!confirm(`Permanently delete ${account.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/system/accounts/${account.id}?hard=true`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.success) {
      setAccounts((current) => current.filter((a) => a.id !== account.id));
      if (viewing?.id === account.id) setViewing(null);
      if (editing?.id === account.id) setEditing(null);
      toast.success(`${account.name} deleted.`);
    } else {
      // Refused when the account holds history; the message names what.
      toast.error(data.message ?? 'Failed to delete account.');
    }
  }

  async function openMove(student: StudentAccount) {
    setMoving(student);
    setHistory([]);
    setMoveClasses([]);
    setMoveForm({
      move: 'promote',
      effectiveDate: new Date().toISOString().slice(0, 10),
      schoolId: '',
      classId: '',
      streamId: '',
      reason: '',
    });
    try {
      const res = await fetch(`/api/admin/system/students/${student.id}/enrollment`);
      const data = await res.json();
      if (data.success) setHistory(data.data);
    } catch {
      toast.error('Could not load their enrolment history.');
    }
  }

  async function chooseMoveSchool(schoolId: string) {
    setMoveForm((f) => ({ ...f, schoolId, classId: '', streamId: '' }));
    setMoveClasses([]);
    if (!schoolId) return;
    const res = await fetch(`/api/admin/system/schools/${schoolId}/classes`);
    const data = await res.json();
    if (data.success) setMoveClasses(data.data);
  }

  async function submitMove(e: React.FormEvent) {
    e.preventDefault();
    if (!moving) return;
    setMovingBusy(true);
    try {
      const res = await fetch(`/api/admin/system/students/${moving.id}/enrollment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          move: moveForm.move,
          effectiveDate: moveForm.effectiveDate,
          toSchoolId: moveForm.schoolId || undefined,
          toClassId: moveForm.classId || undefined,
          toStreamId: moveForm.streamId || null,
          reason: moveForm.reason || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setMoving(null);
        await load();
      } else {
        toast.error(data.message ?? 'Could not move the student.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setMovingBusy(false);
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
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setViewing(a)}
              title={`View ${a.name}`}
              className="p-1.5 rounded-lg text-[#02465B] hover:bg-[#F1F6F8]"
            >
              <Eye className="w-4 h-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void openMove(a)}
              title={`Move or withdraw ${a.name}`}
              className="p-1.5 rounded-lg text-[#02465B] hover:bg-[#F1F6F8]"
            >
              <ArrowRightLeft className="w-4 h-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setEditing(a)}
              title={`Edit ${a.name}`}
              className="p-1.5 rounded-lg text-[#02465B] hover:bg-[#F1F6F8]"
            >
              <Pencil className="w-4 h-4" aria-hidden />
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
            <button
              type="button"
              onClick={() => void toggleActive(a)}
              title={a.isActive ? `Deactivate ${a.name}` : `Reactivate ${a.name}`}
              className="p-1.5 rounded-lg text-[#5A7D8A] hover:bg-[#F1F6F8]"
            >
              {a.isActive ? (
                <PowerOff className="w-4 h-4" aria-hidden />
              ) : (
                <Power className="w-4 h-4" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => void removeAccount(a)}
              title={`Delete ${a.name}`}
              className="p-1.5 rounded-lg text-[#C26565] hover:bg-[#FBF0F0]"
            >
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
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

      {requests.length > 0 && (
        <Card>
          <h2 className="font-semibold text-primary-900 mb-1">Pending student requests</h2>
          <p className="text-sm text-text-muted mb-4">
            Flagged by teachers from the lesson wizard when a learner isn&apos;t on the roster yet.
          </p>
          <div className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-primary-100 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-primary-900">
                    {[r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ')}
                  </p>
                  <p className="text-xs text-text-muted">
                    {[r.classDisplayName, r.streamName].filter(Boolean).join(' ')} · {r.schoolName} · requested by{' '}
                    {r.requestedByName}
                  </p>
                  {r.note && <p className="text-xs text-text-muted mt-0.5">&ldquo;{r.note}&rdquo;</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    disabled={requestBusyId === r.id}
                    onClick={() => void approveRequest(r)}
                  >
                    <Check className="w-4 h-4 mr-1.5" aria-hidden />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    disabled={requestBusyId === r.id}
                    onClick={() => void rejectRequest(r)}
                  >
                    <X className="w-4 h-4 mr-1.5" aria-hidden />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
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

      {viewing && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">{viewing.name}</h2>
            <button type="button" onClick={() => setViewing(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-5">
            {viewing.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewing.photoUrl}
                alt=""
                className="w-24 h-24 rounded-2xl object-cover border border-[#E8EFF3] shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-[#F1F6F8] text-[#5A7D8A] text-2xl font-medium flex items-center justify-center shrink-0">
                {initials(viewing.name) || '—'}
              </div>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 flex-1 text-sm">
              {VIEW_FIELDS.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-[#F1F6F8] py-1.5">
                  <dt className="text-[#5A7D8A]">{label}</dt>
                  <dd className="text-[#12333F] text-right">{value(viewing) || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      )}

      {editing && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">Edit — {editing.systemId}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Full name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
              <Input
                label="Email"
                type="email"
                value={editing.contactEmail ?? ''}
                onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })}
              />
              <Select
                label="Gender"
                options={[
                  { value: '', label: 'Not recorded' },
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ]}
                value={editing.gender ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, gender: (e.target.value || null) as 'male' | 'female' | null })
                }
              />
            </div>
            <p className="text-xs text-text-muted">
              Role and System ID cannot be changed: the ID encodes the role and is referenced by
              enrolments, submissions and audit records.
            </p>
            <div className="flex gap-2">
              <Button type="submit" isLoading={savingEdit}>
                Save changes
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {moving && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">
              Move — {moving.name}
              <span className="block text-xs font-normal text-text-muted">
                Currently {[moving.className, moving.streamName].filter(Boolean).join(' ') || 'not enrolled'}
              </span>
            </h2>
            <button type="button" onClick={() => setMoving(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>

          <form onSubmit={submitMove} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="What is happening"
                options={MOVES}
                value={moveForm.move}
                onChange={(e) => setMoveForm({ ...moveForm, move: e.target.value })}
              />
              <Input
                label="Effective from"
                type="date"
                value={moveForm.effectiveDate}
                onChange={(e) => setMoveForm({ ...moveForm, effectiveDate: e.target.value })}
                required
              />
            </div>

            {moveForm.move !== 'withdraw' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select
                  label="School"
                  options={[
                    { value: '', label: 'Same school' },
                    ...schools.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  value={moveForm.schoolId}
                  onChange={(e) => void chooseMoveSchool(e.target.value)}
                />
                <Select
                  label="Class"
                  options={[
                    { value: '', label: moveForm.schoolId ? 'Select a class' : 'Choose a school first' },
                    ...moveClasses.map((c) => ({
                      value: c.id,
                      label: c.displayName + (c.hasStreams ? ' (has streams)' : ''),
                    })),
                  ]}
                  value={moveForm.classId}
                  disabled={!moveForm.schoolId}
                  onChange={(e) => setMoveForm({ ...moveForm, classId: e.target.value, streamId: '' })}
                  required
                />
                <Select
                  label="Stream"
                  options={[
                    { value: '', label: 'Not applicable' },
                    ...(moveClasses.find((c) => c.id === moveForm.classId)?.streams ?? []).map((s) => ({
                      value: s.id,
                      label: s.name,
                    })),
                  ]}
                  value={moveForm.streamId}
                  disabled={!moveClasses.find((c) => c.id === moveForm.classId)?.hasStreams}
                  onChange={(e) => setMoveForm({ ...moveForm, streamId: e.target.value })}
                />
              </div>
            )}

            <Input
              label={moveForm.move === 'withdraw' ? 'Reason for leaving' : 'Note (optional)'}
              value={moveForm.reason}
              onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
            />

            <p className="text-xs text-text-muted">
              Their current placement is closed on this date and a new one opened — the old record
              is kept, so past lesson reports and results still show the class they were actually in.
            </p>

            <div className="flex gap-2">
              <Button type="submit" isLoading={movingBusy}>
                {moveForm.move === 'withdraw' ? 'Withdraw student' : 'Move student'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setMoving(null)}>
                Cancel
              </Button>
            </div>
          </form>

          {history.length > 0 && (
            <div className="mt-6 pt-4 border-t border-[#F1F6F8]">
              <p className="text-xs font-medium text-[#5A7D8A] mb-2">ENROLMENT HISTORY</p>
              <div className="space-y-1.5">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center gap-2 text-sm border-b border-[#F1F6F8] pb-1.5"
                  >
                    <span className="font-medium text-[#12333F]">
                      {[h.className, h.streamName].filter(Boolean).join(' ')}
                    </span>
                    <span className="text-xs text-text-muted">{h.schoolName}</span>
                    <Badge variant={h.exitedOn ? 'muted' : 'success'}>{h.status}</Badge>
                    <span className="text-xs text-text-muted ml-auto">
                      {h.enrolledOn} → {h.exitedOn ?? 'present'}
                      {h.exitReason ? ` · ${h.exitReason}` : ''}
                    </span>
                  </div>
                ))}
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
