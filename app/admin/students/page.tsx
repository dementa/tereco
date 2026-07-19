'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SCHOOLS } from '@/lib/constants';
import { useToast } from '@/components/ui/ToastProvider';
import { Trash2, UserPlus } from 'lucide-react';

interface Student {
  id: string;
  studentId: string;
  name: string;
  school: string;
  className: string;
}

const firstSchool = Object.keys(SCHOOLS)[0];
const emptyForm = {
  name: '',
  studentId: '',
  school: firstSchool,
  className: SCHOOLS[firstSchool][0] ?? '',
};

export default function AdminStudentsPage() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  // Filters
  const [filterSchool, setFilterSchool] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filterSchool) qs.set('school', filterSchool);
    if (filterClass) qs.set('class', filterClass);
    fetch(`/api/admin/students?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setStudents(d.data);
        else setError(d.message || 'Failed to load');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [filterSchool, filterClass]);

  useEffect(load, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setForm((prev) => ({ ...prev, name: '', studentId: '' }));
        load();
        toast.success(`${form.name} added.`);
      } else {
        setFormError(data.message || 'Failed to add student');
        toast.error(data.message || 'Failed to add student.');
      }
    } catch {
      setFormError('Network error');
      toast.error('Network error — please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this student?')) return;
    const res = await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setStudents((prev) => prev.filter((s) => s.id !== id));
      toast.success('Student removed.');
    } else {
      toast.error(data.message || 'Delete failed.');
    }
  };

  const formClasses = SCHOOLS[form.school] ?? [];
  const filterClasses = filterSchool ? SCHOOLS[filterSchool] ?? [] : [];

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Students</h1>
      <p className="text-sm text-text-muted mb-6">Register learners who will take assessments. They pick their name on the assessment entry screen.</p>

      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary-700" /> Add student
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Student ID (optional)" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
            <Select
              label="School"
              options={Object.keys(SCHOOLS).map((s) => ({ value: s, label: s }))}
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value, className: SCHOOLS[e.target.value]?.[0] ?? '' })}
              required
            />
            <Select
              label="Class"
              options={formClasses.map((c) => ({ value: c, label: c }))}
              value={form.className}
              onChange={(e) => setForm({ ...form, className: e.target.value })}
              required
            />
          </div>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button type="submit" isLoading={creating}>Add student</Button>
        </form>
      </Card>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <h2 className="text-lg font-semibold text-primary-900 mr-auto">Registered students</h2>
        <div className="w-48">
          <Select
            label="Filter school"
            options={[{ value: '', label: 'All schools' }, ...Object.keys(SCHOOLS).map((s) => ({ value: s, label: s }))]}
            value={filterSchool}
            onChange={(e) => { setFilterSchool(e.target.value); setFilterClass(''); }}
          />
        </div>
        <div className="w-36">
          <Select
            label="Filter class"
            options={[{ value: '', label: 'All classes' }, ...filterClasses.map((c) => ({ value: c, label: c }))]}
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            disabled={!filterSchool}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-error">{error}</p>
      ) : students.length === 0 ? (
        <p className="text-text-muted">No students registered.</p>
      ) : (
        <div className="space-y-3">
          {students.map((s) => (
            <Card key={s.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-primary-900 truncate">{s.name} {s.studentId && <span className="text-text-faint font-normal">({s.studentId})</span>}</p>
                <p className="text-xs text-text-muted truncate">{s.school} • {s.className}</p>
              </div>
              <Button variant="outline" className="text-error border-error/20 hover:bg-error-bg shrink-0" onClick={() => handleDelete(s.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
