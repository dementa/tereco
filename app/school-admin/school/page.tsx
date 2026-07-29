'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';

interface School {
  id: string;
  systemId: string;
  name: string;
  location: string;
  phone: string;
  email: string | null;
  logoUrl: string | null;
  joinedOn: string | null;
  isActive: boolean;
  contactName: string | null;
}

const FIELDS: [string, (s: School) => string][] = [
  ['School ID', (s) => s.systemId],
  ['Location', (s) => s.location || '—'],
  ['Phone', (s) => s.phone || '—'],
  ['Email', (s) => s.email ?? '—'],
  ['Contact person', (s) => s.contactName ?? '—'],
  ['Joined the programme', (s) => (s.joinedOn ? new Date(s.joinedOn).toLocaleDateString() : '—')],
];

export default function SchoolAdminSchoolPage() {
  const toast = useToast();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/school-admin/school');
        const data = await res.json();
        if (cancelled) return;
        if (data.success) setSchool(data.data);
        else toast.error(data.message ?? 'Failed to load your school.');
      } catch {
        if (!cancelled) toast.error('Network error while loading your school.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">My School</h1>
        <p className="text-sm text-text-muted">
          Read-only — logo and contact-person changes are handled by TERECO administrators.
        </p>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : !school ? (
          <p className="text-sm text-text-muted">Could not load your school.</p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-5">
            {school.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={school.logoUrl}
                alt=""
                className="w-20 h-20 rounded-2xl object-contain bg-[#F1F6F8] border border-[#E8EFF3] shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-[#F1F6F8] text-[#9BB3BD] text-xs flex items-center justify-center shrink-0">
                No logo
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-primary-900 text-lg flex items-center gap-2">
                {school.name}
                {!school.isActive && <Badge variant="muted">Inactive</Badge>}
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-y-2 text-sm">
                {FIELDS.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-[#F1F6F8] py-1.5">
                    <dt className="text-[#5A7D8A]">{label}</dt>
                    <dd className="text-[#12333F] text-right">{value(school)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
