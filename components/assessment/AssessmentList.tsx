'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Clock } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

interface Assessment {
  id: string;
  /** The public ASS#### identifier. Every student-facing route keys off this,
   *  not the uuid — the API resolves assessments by system id. */
  systemId: string;
  title: string;
  description: string;
  timeLimit: number;
  opensAt?: string;
  closesAt?: string;
}

/** Set when a learner chooses "not now" on the password-change screen. */
export const SKIP_PASSWORD_CHANGE_KEY = 'tereco_skip_password_change';

export function AssessmentList() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, mustChangePassword } = useAuth();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || user?.role !== 'student') {
      router.push('/assessment');
      return;
    }
    // Offered, not imposed: a learner who chose "not now" is not sent back here
    // on every navigation for the rest of their session.
    if (mustChangePassword && !sessionStorage.getItem(SKIP_PASSWORD_CHANGE_KEY)) {
      router.push('/assessment/change-password');
      return;
    }

    // No school/class query params: which assessments a student may sit is
    // decided server-side from their enrolment, so the client cannot widen it.
    fetch('/api/assessments')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAssessments(data.data);
        } else {
          setError('Failed to load assessments.');
        }
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, [router, user, isAuthenticated, authLoading, mustChangePassword]);

  // Just navigate. The take screen fetches the assessment's time limit itself
  // and records the start timestamp on mount if one is not already stored —
  // writing them here as well duplicated that logic and started the clock even
  // when the navigation never completed.
  const handleStart = (assessment: Assessment) => {
    router.push(`/assessment/take/${assessment.systemId}`);
  };

  if (loading) {
    return <div className="p-8 text-center text-[#5A7A85]">Loading assessments...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-[#C0392B]">{error}</div>;
  }

  if (assessments.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[#5A7A85]">No assessments available for your school and class.</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push('/assessment')}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#011E28] mb-6">Available Assessments</h1>
      <div className="grid gap-4">
        {assessments.map((a) => (
          <Card key={a.id} hover className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
            <div>
              <h3 className="text-lg font-semibold text-[#011E28]">{a.title}</h3>
              <p className="text-sm text-[#5A7A85]">{a.description}</p>
              <div className="flex items-center gap-1 mt-1 text-xs text-[#9BBAC5]">
                <Clock className="w-3.5 h-3.5" />
                {a.timeLimit} minutes
                {/* Anything listed here is already open — the server only
                    returns assessments inside their window — so the useful
                    thing to show is the deadline, not availability. */}
                {a.closesAt && (
                  <span className="ml-2 text-[#C4952A]">
                    (Closes {new Date(a.closesAt).toLocaleString()})
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="primary" onClick={() => handleStart(a)}>
                Start Assessment
              </Button>
              {/* For learners without a computer, or sitting the paper in class. */}
              <Button
                variant="outline"
                onClick={() => router.push(`/assessment/paper/${a.systemId}`)}
              >
                Do it on paper
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}