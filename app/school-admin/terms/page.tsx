'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { TermsManager } from '@/components/admin/TermsManager';
import { useToast } from '@/components/ui/ToastProvider';

interface AcademicYear {
  id: string;
  label: string;
  isCurrent: boolean;
}

export default function SchoolAdminTermsPage() {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/system/academic-years');
        const data = await res.json();
        if (data.success) {
          setYears(data.data);
          const current = data.data.find((y: AcademicYear) => y.isCurrent);
          setYearId(current?.id ?? data.data[0]?.id ?? '');
        } else {
          toast.error(data.message ?? 'Failed to load academic years.');
        }
      } catch {
        toast.error('Network error while loading academic years.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Terms</h1>
        <p className="text-sm text-text-muted">
          Define up to 3 terms per academic year for your school. A lesson&apos;s date resolves to
          whichever term its date falls within, so terms cannot overlap.
        </p>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : years.length === 0 ? (
          <p className="text-sm text-text-muted">
            No academic years exist yet — ask a super admin to create one before adding terms.
          </p>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">Academic year</label>
              <select
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
                className="border border-primary-100 rounded-lg px-3 py-2 text-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                    {y.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {yearId && <TermsManager apiBasePath="/api/school-admin/terms" academicYearId={yearId} />}
          </>
        )}
      </Card>
    </div>
  );
}
