'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';
import { Eye } from 'lucide-react';

interface StudentAccount {
  id: string;
  systemId: string | null;
  name: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  contactEmail: string | null;
  gender: 'male' | 'female' | null;
  className: string | null;
  streamName: string | null;
  photoUrl: string | null;
  dateOfBirth: string | null;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

const VIEW_FIELDS: [string, (a: StudentAccount) => string][] = [
  ['Student ID', (a) => a.systemId ?? ''],
  ['Class', (a) => a.className ?? ''],
  ['Stream', (a) => a.streamName ?? ''],
  ['Email', (a) => a.contactEmail ?? ''],
  ['Gender', (a) => a.gender ?? ''],
  ['Date of birth', (a) => (a.dateOfBirth ? new Date(a.dateOfBirth).toLocaleDateString() : '')],
  ['Phone', (a) => a.phonePrimary ?? ''],
  ['Alternate phone', (a) => a.phoneSecondary ?? ''],
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

// Read-only: adding, editing, deactivating, deleting a student account, or
// resetting its password is super_admin-only (see /api/admin/system/students
// and /api/admin/system/accounts/[id]). A school_admin views their school's
// student roster here, same as every other data type in this portal.
export default function SchoolAdminStudentsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<StudentAccount | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/school-admin/students');
      const data = await res.json();
      if (data.success) setAccounts(data.data);
      else toast.error(data.message ?? 'Failed to load students.');
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

  const columns: DataTableColumn<StudentAccount>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Student',
        value: (a) => a.name,
        render: (a) => (
          <span className="flex items-center gap-2.5">
            {a.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.photoUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover border border-[#EAEAEA] shrink-0"
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-[#FAFAFA] text-[#666666] text-xs font-medium flex items-center justify-center shrink-0">
                {initials(a.name) || '—'}
              </span>
            )}
            <span className="min-w-0">
              <span className="font-medium block truncate">{a.name}</span>
              {!a.isActive && <Badge variant="muted">Deactivated</Badge>}
            </span>
          </span>
        ),
      },
      { key: 'systemId', header: 'Student ID', value: (a) => a.systemId ?? '—' },
      {
        key: 'className',
        header: 'Class',
        value: (a) => a.className ?? '',
        render: (a) =>
          a.className ?? <span className="text-[#A3A3A3]" title="No open enrolment">Not enrolled</span>,
      },
      { key: 'streamName', header: 'Stream', value: (a) => a.streamName ?? '', hideOnMobile: true },
      { key: 'contactEmail', header: 'Email', value: (a) => a.contactEmail ?? '—', hideOnMobile: true },
    ],
    []
  );

  const rowActions = useCallback(
    (a: StudentAccount) => [{ label: 'View profile', icon: Eye, onClick: () => setViewing(a) }],
    []
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Students</h1>
        <p className="text-sm text-text-muted">
          Read-only — a super_admin adds students, moves them between classes, and manages accounts.
        </p>
      </div>

      <DataTable
        rows={accounts}
        columns={columns}
        rowActions={rowActions}
        rowKey={(a) => a.id}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search by name, student ID, class or stream…"
        emptyMessage="No student accounts yet."
        exportFileName="students"
        mobileTitle={(a) => a.name}
        filters={[
          {
            key: 'class',
            label: 'Class',
            options: Array.from(new Set(accounts.map((a) => a.className).filter((c): c is string => !!c)))
              .sort()
              .map((c) => ({ value: c, label: c })),
            matches: (a, v) => a.className === v,
          },
          {
            key: 'stream',
            label: 'Stream',
            options: Array.from(new Set(accounts.map((a) => a.streamName).filter((s): s is string => !!s)))
              .sort()
              .map((s) => ({ value: s, label: s })),
            matches: (a, v) => a.streamName === v,
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Deactivated' },
              { value: 'unenrolled', label: 'Not enrolled' },
            ],
            matches: (a, v) => (v === 'active' ? a.isActive : v === 'inactive' ? !a.isActive : !a.className),
          },
        ]}
      />

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.name}>
          <div className="flex flex-col sm:flex-row gap-5">
            {viewing.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewing.photoUrl} alt="" className="w-24 h-24 rounded-2xl object-cover border border-[#EAEAEA] shrink-0" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-[#FAFAFA] text-[#666666] text-2xl font-medium flex items-center justify-center shrink-0">
                {initials(viewing.name) || '—'}
              </div>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 flex-1 text-sm">
              {VIEW_FIELDS.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-[#FAFAFA] py-1.5">
                  <dt className="text-[#666666]">{label}</dt>
                  <dd className="text-[#12333F] text-right min-w-0 break-words">{value(viewing) || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Modal>
      )}
    </div>
  );
}
