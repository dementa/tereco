'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { Eye, X } from 'lucide-react';

interface StaffAccount {
  id: string;
  systemId: string | null;
  name: string;
  contactEmail: string | null;
  gender: 'male' | 'female' | null;
  photoUrl: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

const VIEW_FIELDS: [string, (a: StaffAccount) => string][] = [
  ['System ID', (a) => a.systemId ?? ''],
  ['Email', (a) => a.contactEmail ?? ''],
  ['Gender', (a) => a.gender ?? ''],
  ['Status', (a) => (a.isActive ? 'Active' : 'Deactivated')],
  ['First login', (a) => (a.mustChangePassword ? 'Pending' : 'Done')],
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

// Read-only: adding, editing, deactivating, deleting a staff account or
// resetting its password is super_admin-only (see /api/admin/system/staff
// and /api/admin/system/accounts/[id]). A school_admin views their school's
// staff roster here, same as every other data type in this portal.
export default function SchoolAdminStaffPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<StaffAccount | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/school-admin/staff');
      const data = await res.json();
      if (data.success) setAccounts(data.data);
      else toast.error(data.message ?? 'Failed to load staff.');
    } catch {
      toast.error('Network error while loading staff.');
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

  const columns: DataTableColumn<StaffAccount>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
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
              {a.mustChangePassword && a.isActive && <Badge variant="accent">Pending first login</Badge>}
            </span>
          </span>
        ),
      },
      { key: 'systemId', header: 'System ID', value: (a) => a.systemId ?? '—' },
      { key: 'contactEmail', header: 'Email', value: (a) => a.contactEmail ?? '—', hideOnMobile: true },
    ],
    []
  );

  const rowActions = useCallback(
    (a: StaffAccount): DropdownMenuItem[] => [{ label: 'View profile', icon: Eye, onClick: () => setViewing(a) }],
    []
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Staff</h1>
        <p className="text-sm text-text-muted">
          Read-only — a super_admin adds staff, resets passwords, and manages accounts.
        </p>
      </div>

      <DataTable
        rows={accounts}
        columns={columns}
        rowActions={rowActions}
        rowKey={(a) => a.id}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search by name, ID or email…"
        emptyMessage="No staff accounts yet."
        exportFileName="staff-accounts"
        mobileTitle={(a) => a.name}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Deactivated' },
              { value: 'pending', label: 'Pending first login' },
            ],
            matches: (a, v) => (v === 'active' ? a.isActive : v === 'inactive' ? !a.isActive : a.isActive && a.mustChangePassword),
          },
        ]}
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
        </Card>
      )}
    </div>
  );
}
