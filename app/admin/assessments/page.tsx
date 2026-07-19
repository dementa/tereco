'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';

interface Assessment {
  id: string;
  title: string;
  description: string;
  timeLimit: number;
  startTime?: string;
  targetType: string;
  targetValue: string;
}

const emptyForm = {
  title: '',
  description: '',
  timeLimit: 30,
  startTime: '',
  targetType: 'general',
  targetValue: '',
};

export default function AdminAssessments() {
  const router = useRouter();
  const toast = useToast();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newAssessment, setNewAssessment] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/assessments')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAssessments(data.data);
        else setError(data.message || 'Failed to load');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAssessment),
      });
      const data = await res.json();
      if (data.success) {
        setNewAssessment(emptyForm);
        load();
        toast.success('Assessment created.');
        router.push(`/admin/assessments/${data.data.id}`);
      } else {
        setFormError(data.message || 'Creation failed');
        toast.error(data.message || 'Creation failed.');
      }
    } catch {
      setFormError('Network error');
      toast.error('Network error — please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete assessment "${id}"?`)) return;
    const res = await fetch(`/api/admin/assessments/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setAssessments((prev) => prev.filter((a) => a.id !== id));
      toast.success('Assessment deleted.');
    } else {
      toast.error(data.message || 'Delete failed.');
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Assessments</h1>
      <p className="text-sm text-text-muted mb-6">Create assessments, then add questions in the editor.</p>

      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4">Create new assessment</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Title" value={newAssessment.title} onChange={(e) => setNewAssessment((p) => ({ ...p, title: e.target.value }))} required />
            <Input label="Description" value={newAssessment.description} onChange={(e) => setNewAssessment((p) => ({ ...p, description: e.target.value }))} />
            <Input label="Time limit (minutes)" type="number" value={newAssessment.timeLimit} onChange={(e) => setNewAssessment((p) => ({ ...p, timeLimit: parseInt(e.target.value) || 0 }))} required />
            <Input label="Start time (optional)" type="datetime-local" value={newAssessment.startTime} onChange={(e) => setNewAssessment((p) => ({ ...p, startTime: e.target.value }))} />
            <Select
              label="Target type"
              options={[
                { value: 'general', label: 'General (all students)' },
                { value: 'class', label: 'Specific class' },
                { value: 'school+class', label: 'School + class' },
              ]}
              value={newAssessment.targetType}
              onChange={(e) => setNewAssessment((p) => ({ ...p, targetType: e.target.value }))}
              required
            />
            {newAssessment.targetType !== 'general' && (
              <Input
                label="Target value"
                value={newAssessment.targetValue}
                onChange={(e) => setNewAssessment((p) => ({ ...p, targetValue: e.target.value }))}
                placeholder={newAssessment.targetType === 'class' ? 'e.g. P.4B' : 'e.g. Ebenezer Standard Junior School|P.4B'}
                required
              />
            )}
          </div>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button type="submit" isLoading={creating}>Create assessment</Button>
        </form>
      </Card>

      <h2 className="text-lg font-semibold text-primary-900 mb-4">Existing assessments</h2>
      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-error">{error}</p>
      ) : assessments.length === 0 ? (
        <p className="text-text-muted">No assessments found.</p>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <Card key={a.id} className="p-4 flex flex-wrap justify-between items-center gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-primary-900 truncate">{a.title}</p>
                <p className="text-xs text-text-muted">ID: {a.id} • {a.timeLimit} min • {a.targetType}{a.targetValue && ` (${a.targetValue})`}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => router.push(`/admin/assessments/${a.id}`)}>Edit questions</Button>
                <Button variant="outline" onClick={() => handleDelete(a.id)} className="text-error border-error/20 hover:bg-error-bg">Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
