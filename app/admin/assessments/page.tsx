'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SCHOOLS } from '@/lib/constants';

interface Assessment {
  id: string;
  title: string;
  description: string;
  timeLimit: number;
  startTime?: string;
  targetType: string;
  targetValue: string;
  questionsSheet: string;
}

export default function AdminAssessments() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New assessment form
  const [newAssessment, setNewAssessment] = useState({
    id: '',
    title: '',
    description: '',
    timeLimit: 30,
    startTime: '',
    targetType: 'general',
    targetValue: '',
    questionsSheet: '',
  });

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/admin/assessments')
      .then(async (res) => {
        console.log('Status:', res.status);

        const text = await res.text();
        console.log('Response:', text);

        return JSON.parse(text);
      })
      .then((data) => {
        if (data.success) {
          setAssessments(data.data);
        } else {
          setError(data.message);
        }
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAssessment),
      });
      const data = await res.json();
      if (data.success) {
        alert('Assessment created!');
        // Refresh list
        setAssessments(prev => [...prev, newAssessment as Assessment]);
        // Reset form
        setNewAssessment({
          id: '',
          title: '',
          description: '',
          timeLimit: 30,
          startTime: '',
          targetType: 'general',
          targetValue: '',
          questionsSheet: '',
        });
      } else {
        alert(data.message || 'Creation failed');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
  if (!confirm(`Are you sure you want to delete assessment "${id}"?`)) return;
  try {
    const res = await fetch(`/api/admin/assessments/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setAssessments(prev => prev.filter(a => a.id !== id));
    } else {
      alert(data.message || 'Delete failed');
    }
  } catch (err) {
    alert('Network error');
  }
};

  return (
    <div className="min-h-screen bg-[#F5FDFF] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-[#011E28] mb-6">Manage Assessments</h1>

        {/* Create Form */}
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold text-[#011E28] mb-4">Create New Assessment</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Assessment ID"
                value={newAssessment.id}
                onChange={e => setNewAssessment(prev => ({ ...prev, id: e.target.value }))}
                placeholder="e.g., ASSESS-001"
                required
              />
              <Input
                label="Title"
                value={newAssessment.title}
                onChange={e => setNewAssessment(prev => ({ ...prev, title: e.target.value }))}
                required
              />
              <Input
                label="Description"
                value={newAssessment.description}
                onChange={e => setNewAssessment(prev => ({ ...prev, description: e.target.value }))}
              />
              <Input
                label="Time Limit (minutes)"
                type="number"
                value={newAssessment.timeLimit}
                onChange={e => setNewAssessment(prev => ({ ...prev, timeLimit: parseInt(e.target.value) || 0 }))}
                required
              />
              <Input
                label="Start Time (optional)"
                type="datetime-local"
                value={newAssessment.startTime}
                onChange={e => setNewAssessment(prev => ({ ...prev, startTime: e.target.value }))}
              />
              <Select
                label="Target Type"
                options={[
                  { value: 'general', label: 'General' },
                  { value: 'class', label: 'Class' },
                  { value: 'school+class', label: 'School + Class' },
                ]}
                value={newAssessment.targetType}
                onChange={e => setNewAssessment(prev => ({ ...prev, targetType: e.target.value }))}
                required
              />
              {newAssessment.targetType !== 'general' && (
                <Input
                  label="Target Value"
                  value={newAssessment.targetValue}
                  onChange={e => setNewAssessment(prev => ({ ...prev, targetValue: e.target.value }))}
                  placeholder={newAssessment.targetType === 'class' ? 'e.g., Form 3A' : 'e.g., Nairobi Academy|Form 4A'}
                  required
                />
              )}
              <Input
                label="Questions Sheet Name"
                value={newAssessment.questionsSheet}
                onChange={e => setNewAssessment(prev => ({ ...prev, questionsSheet: e.target.value }))}
                placeholder="e.g., ASSESS-001_Q"
                required
              />
            </div>
            <Button type="submit" isLoading={creating}>Create Assessment</Button>
          </form>
        </Card>

        {/* List */}
        <h2 className="text-lg font-semibold text-[#011E28] mb-4">Existing Assessments</h2>
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p className="text-[#C0392B]">{error}</p>
        ) : assessments.length === 0 ? (
          <p className="text-[#5A7A85]">No assessments found.</p>
        ) : (
          <div className="space-y-3">
            {assessments.map(a => (
              <Card key={a.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-[#011E28]">{a.title}</p>
                  <p className="text-xs text-[#5A7A85]">ID: {a.id} • {a.timeLimit} min • {a.targetType} {a.targetValue && `(${a.targetValue})`}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => router.push(`/admin/assessments/${a.id}`)}>
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => handleDelete(a.id)} className="text-[#C0392B] border-[#C0392B]/20 hover:bg-red-50">
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}