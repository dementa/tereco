'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { EnterMarksPanel } from '@/components/assessment/EnterMarksPanel';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * Data Forms entry point: rate how learners have been behaving, no
 * "assessment" in sight. Resolves (creating on first use) this school's own
 * backing assessment server-side, then hands off to the same scoring
 * screen enter-marks uses, locked to band-rating mode with the school
 * fixed to the teacher's own.
 */
export default function BehaviourRatingPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [assessmentSystemId, setAssessmentSystemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/staff/behaviour-assessment');
        const data = await res.json();
        if (data.success) setAssessmentSystemId(data.data.systemId);
        else toast.error(data.message ?? 'Could not open the behaviour rating form.');
      } catch {
        toast.error('Network error while opening the behaviour rating form.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (!assessmentSystemId || !user?.schoolId) {
    return <p className="text-sm text-text-muted">Could not open the behaviour rating form.</p>;
  }

  return (
    <EnterMarksPanel
      assessmentSystemId={assessmentSystemId}
      backHref="/staff/forms"
      heading="Behaviour Rating"
      fixedSchoolId={user.schoolId}
      lockToBandMode
    />
  );
}
