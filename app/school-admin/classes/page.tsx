'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';

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
  isActive: boolean;
  streams: Stream[];
}

// Read-only: adding/editing/deleting a class or stream is super_admin-only
// (see /api/admin/system/schools/[id]/classes). A school_admin views their
// school's roster here, same as every other data type in this portal.
export default function SchoolAdminClassesPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school-admin/classes');
      const data = await res.json();
      if (data.success) setClasses(data.data);
      else toast.error(data.message ?? 'Failed to load classes.');
    } catch {
      toast.error('Network error loading classes.');
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Classes & Streams</h1>
        <p className="text-sm text-text-muted">
          The classes your school runs, and their streams (Bright, Clever, A/B). Read-only — a
          super_admin manages classes and streams.
        </p>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-text-muted">Loading classes…</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-text-muted">No classes configured yet.</p>
        ) : (
          <div className="space-y-2">
            {classes.map((cls) => (
              <div key={cls.id} className="rounded-xl border border-[#EAEAEA] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#12333F]">{cls.displayName}</span>
                  {cls.level !== null && cls.alias && <Badge variant="muted">Level {cls.level}</Badge>}
                  {cls.level === null && <Badge variant="accent">Off-ladder</Badge>}
                  {!cls.isActive && <Badge variant="muted">Inactive</Badge>}
                </div>

                {cls.hasStreams && cls.streams.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {cls.streams.map((stream) => (
                      <span
                        key={stream.id}
                        className="inline-flex items-center rounded-lg bg-[#FAFAFA] px-2 py-1 text-xs text-[#12333F]"
                      >
                        {stream.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
