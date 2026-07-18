'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SCHOOLS } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface StudentOption {
  id: string;
  name: string;
}

const NOT_LISTED = '__not_listed__';

export function AssessmentEntry() {
  const router = useRouter();
  const [school, setSchool] = useState('');
  const [className, setClassName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const classes = SCHOOLS[school] || [];

  // Load the registered students for the chosen school/class.
  useEffect(() => {
    if (!school || !className) {
      setStudents([]);
      setSelectedStudent('');
      return;
    }
    setLoadingStudents(true);
    setSelectedStudent('');
    setStudentName('');
    const qs = new URLSearchParams({ school, class: className });
    fetch(`/api/students?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => setStudents(d.success ? d.data : []))
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, [school, className]);

  const usingList = students.length > 0 && selectedStudent !== NOT_LISTED;

  const resolvedName = usingList
    ? students.find((s) => s.id === selectedStudent)?.name ?? ''
    : studentName.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !className || !resolvedName) {
      setError('Please select your school, class and name.');
      return;
    }
    setLoading(true);
    sessionStorage.setItem(
      'assessmentStudent',
      JSON.stringify({ school, className, studentName: resolvedName })
    );
    router.push('/assessment/list');
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign-in
        </button>
        <h1 className="text-2xl font-bold text-primary-900 text-center mb-2">Assessment Portal</h1>
        <p className="text-sm text-text-muted text-center mb-6">Enter your details to start</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="School"
            options={[{ value: '', label: 'Select your school…' }, ...Object.keys(SCHOOLS).map((s) => ({ value: s, label: s }))]}
            value={school}
            onChange={(e) => { setSchool(e.target.value); setClassName(''); }}
            required
          />
          <Select
            label="Class"
            options={[{ value: '', label: 'Select your class…' }, ...classes.map((c) => ({ value: c, label: c }))]}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            required
            disabled={!school}
          />

          {loadingStudents ? (
            <p className="text-sm text-text-muted">Loading students…</p>
          ) : students.length > 0 ? (
            <>
              <Select
                label="Your Name"
                options={[
                  { value: '', label: 'Select your name…' },
                  ...students.map((s) => ({ value: s.id, label: s.name })),
                  { value: NOT_LISTED, label: "My name isn't listed" },
                ]}
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                required
              />
              {selectedStudent === NOT_LISTED && (
                <Input
                  label="Type your full name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              )}
            </>
          ) : (
            <Input
              label="Your Name"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Enter your full name"
              required
              disabled={!className}
            />
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <Button type="submit" className="w-full" isLoading={loading}>
            Continue to Assessments
          </Button>
        </form>
      </Card>
    </div>
  );
}
