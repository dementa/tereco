'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SCHOOLS } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export function AssessmentEntry() {
  const router = useRouter();
  const [school, setSchool] = useState('');
  const [className, setClassName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const classes = SCHOOLS[school] || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !className || !studentName.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    // Store student info in sessionStorage for use during the assessment
    sessionStorage.setItem('assessmentStudent', JSON.stringify({ school, className, studentName }));
    router.push('/assessment/list');
  };

  return (
    <div className="min-h-screen bg-[#F5FDFF] flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-[#011E28] text-center mb-2">Assessment Portal</h1>
        <p className="text-sm text-[#5A7A85] text-center mb-6">Enter your details to start</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="School"
            options={Object.keys(SCHOOLS).map(s => ({ value: s, label: s }))}
            value={school}
            onChange={(e) => {
              setSchool(e.target.value);
              setClassName('');
            }}
            required
          />
          <Select
            label="Class"
            options={classes.map(c => ({ value: c, label: c }))}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            required
            disabled={!school}
          />
          <Input
            label="Your Name"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Enter your full name"
            required
          />

          {error && <p className="text-sm text-[#C0392B]">{error}</p>}

          <Button type="submit" className="w-full" isLoading={loading}>
            Continue to Assessments
          </Button>
        </form>
      </Card>
    </div>
  );
}