'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Meter } from '@/components/ui/Meter';

interface Progress {
  totalScripts: number;
  markedScripts: number;
  pendingScripts: number;
  fullyMarkedPapers: number;
  totalPapers: number;
}

/**
 * System-wide marking totals — the sample screenshot's "Free plan usage"
 * panel, repurposed: same shell (title, subtitle, metered rows), different
 * subject. Read-only, no action button — there's nothing to upgrade here.
 * super_admin only: aggregates across every school, not one account's own.
 */
export function MarkingProgressPanel() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/marking-progress');
        const data = await res.json();
        if (!cancelled && data.success) setProgress(data.data);
      } catch {
        // Silent — this panel is a supplement to the assessment list, not
        // its subject, so a failed fetch just leaves the panel empty rather
        // than blocking the page with an error.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <h2 className="font-semibold text-primary-900">Marking progress</h2>
      <p className="text-xs text-text-muted mb-4">How marking is going across every school.</p>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : !progress || progress.totalScripts === 0 ? (
        <p className="text-sm text-text-muted">No submissions yet.</p>
      ) : (
        <div className="space-y-4">
          <Meter
            label="Scripts marked"
            value={progress.markedScripts}
            max={progress.totalScripts}
            formatValue={(v, m) => `${v} / ${m}`}
          />
          <Meter
            label="Awaiting marking"
            value={progress.pendingScripts}
            max={progress.totalScripts}
            formatValue={(v) => `${v}`}
          />
          <Meter
            label="Fully marked papers"
            value={progress.fullyMarkedPapers}
            max={progress.totalPapers}
            formatValue={(v, m) => `${v} / ${m}`}
          />
        </div>
      )}
    </Card>
  );
}
