'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SCHOOLS } from '@/lib/constants';
import { Trash2, UserPlus } from 'lucide-react';

interface StaffUser {
  staffId: string;
  name: string;
  role: string;
  school: string;
}

const ROLES = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'admin', label: 'Admin' },
];

const emptyForm = { staffId: '', passcode: '', name: '', role: 'teacher', school: Object.keys(SCHOOLS)[0] };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setUsers(d.data);
        else setError(d.message || 'Failed to load');
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
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setForm(emptyForm);
        load();
      } else {
        setFormError(data.message || 'Failed to create user');
      }
    } catch {
      setFormError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (staffId: string) => {
    if (!confirm(`Delete staff user "${staffId}"?`)) return;
    const res = await fetch(`/api/admin/users/${encodeURIComponent(staffId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) setUsers((prev) => prev.filter((u) => u.staffId !== staffId));
    else alert(data.message || 'Delete failed');
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Staff Users</h1>
      <p className="text-sm text-text-muted mb-6">Add or remove people who can sign in to the system.</p>

      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary-700" /> Add user
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Staff ID" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} placeholder="e.g. TCH-2026-002" required />
            <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Passcode" type="text" value={form.passcode} onChange={(e) => setForm({ ...form, passcode: e.target.value })} placeholder="Initial passcode" required />
            <Select label="Role" options={ROLES} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required />
            <Select
              label="School"
              options={Object.keys(SCHOOLS).map((s) => ({ value: s, label: s }))}
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
              required
            />
          </div>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button type="submit" isLoading={creating}>Create user</Button>
        </form>
      </Card>

      <h2 className="text-lg font-semibold text-primary-900 mb-4">Existing users</h2>
      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-error">{error}</p>
      ) : users.length === 0 ? (
        <p className="text-text-muted">No users yet.</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.staffId} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-primary-900 truncate">{u.name} <span className="text-text-faint font-normal">({u.staffId})</span></p>
                <p className="text-xs text-text-muted truncate">{u.role} • {u.school}</p>
              </div>
              <Button variant="outline" className="text-error border-error/20 hover:bg-error-bg shrink-0" onClick={() => handleDelete(u.staffId)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
