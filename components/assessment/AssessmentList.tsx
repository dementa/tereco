'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Clock } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

interface Assessment {
  id: string;
  title: string;
  description: string;
  timeLimit: number;
  startTime?: string;
}

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
    if (mustChangePassword) {
      router.push('/assessment/change-password');
      return;
    }

    fetch(`/api/assessments?school=${encodeURIComponent(user.school)}&class=${encodeURIComponent(user.className ?? '')}`)
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

  const handleStart = (assessment: Assessment) => {
    // Store time limit and start timestamp
    sessionStorage.setItem(`assessment_${assessment.id}_timeLimit`, assessment.timeLimit.toString());
    const startTime = Date.now();
    sessionStorage.setItem(`assessment_${assessment.id}_start`, startTime.toString());
    router.push(`/assessment/take/${assessment.id}`);
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
                {a.startTime && new Date(a.startTime) > new Date() && (
                  <span className="ml-2 text-[#C4952A]">(Starts at {new Date(a.startTime).toLocaleString()})</span>
                )}
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => handleStart(a)}
              disabled={Boolean(a.startTime) && new Date(a.startTime!) > new Date()}
            >
              {a.startTime && new Date(a.startTime) > new Date()
                ? 'Not yet available'
                : 'Start Assessment'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}