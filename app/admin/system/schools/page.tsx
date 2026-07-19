'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { School as SchoolIcon, Plus, Layers, Trash2, X } from 'lucide-react';

interface School {
  id: string;
  systemId: string;
  name: string;
  location: string;
  contactEmail: string | null;
  contactPerson: string;
  contactNumber: string;
}
interface Stream { id: string; name: string; }
interface SchoolClass { id: string; name: string; hasStreams: boolean; streams: Stream[]; }

const emptyForm = { name: '', location: '', contactEmail: '', contactPerson: '', contactNumber: '' };
const emptyClassForm = { name: '', hasStreams: false };

export default function SystemSchoolsPage() {
  const toast = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const reloadSchools = () => {
    setLoading(true);
    fetch('/api/admin/system/schools')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setSchools(d.data);
        else setLoadError(d.message || 'Failed to load schools.');
      })
      .catch(() => setLoadError('Network error'))
      .finally(() => setLoading(false));
  };

  useEffect(reloadSchools, []);

  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const [managingId, setManagingId] = useState<string | null>(null);
  const [classes, setClasses] = useState<Record<string, SchoolClass[]>>({});
  const [loadingClassesFor, setLoadingClassesFor] = useState<string | null>(null);
  const [classForm, setClassForm] = useState(emptyClassForm);
  const [addingStreamFor, setAddingStreamFor] = useState<string | null>(null);
  const [streamName, setStreamName] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/system/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setForm(emptyForm);
        reloadSchools();
        toast.success(`${form.name} added.`);
      } else {
        setFormError(data.message || 'Failed to create school');
        toast.error(data.message || 'Failed to create school.');
      }
    } catch {
      setFormError('Network error');
      toast.error('Network error — please try again.');
    } finally {
      setCreating(false);
    }
  };

  const loadClasses = async (schoolId: string) => {
    setLoadingClassesFor(schoolId);
    try {
      const res = await fetch(`/api/admin/system/schools/${schoolId}/classes`);
      const data = await res.json();
      if (data.success) setClasses((prev) => ({ ...prev, [schoolId]: data.data }));
      else toast.error(data.message || 'Failed to load classes.');
    } catch {
      toast.error('Network error loading classes.');
    } finally {
      setLoadingClassesFor((current) => (current === schoolId ? null : current));
    }
  };

  const toggleManage = (schoolId: string) => {
    const opening = managingId !== schoolId;
    setManagingId(opening ? schoolId : null);
    setClassForm(emptyClassForm);
    setAddingStreamFor(null);
    if (opening && !classes[schoolId]) loadClasses(schoolId);
  };

  const handleAddClass = async (schoolId: string) => {
    if (!classForm.name.trim()) return;
    const res = await fetch(`/api/admin/system/schools/${schoolId}/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(classForm),
    });
    const data = await res.json();
    if (data.success) {
      setClassForm(emptyClassForm);
      loadClasses(schoolId);
      toast.success(`Class "${data.data.name}" added.`);
    } else {
      toast.error(data.message || 'Failed to add class.');
    }
  };

  const handleToggleStreams = async (schoolId: string, cls: SchoolClass) => {
    const res = await fetch(`/api/admin/system/schools/${schoolId}/classes/${cls.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasStreams: !cls.hasStreams }),
    });
    const data = await res.json();
    if (data.success) loadClasses(schoolId);
    else toast.error(data.message || 'Failed to update class.');
  };

  const handleDeleteClass = async (schoolId: string, cls: SchoolClass) => {
    if (!confirm(`Delete class "${cls.name}"?`)) return;
    const res = await fetch(`/api/admin/system/schools/${schoolId}/classes/${cls.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadClasses(schoolId);
      toast.success('Class deleted.');
    } else {
      toast.error(data.message || 'Failed to delete class.');
    }
  };

  const handleAddStream = async (schoolId: string, classId: string) => {
    if (!streamName.trim()) return;
    const res = await fetch(`/api/admin/system/schools/${schoolId}/classes/${classId}/streams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: streamName }),
    });
    const data = await res.json();
    if (data.success) {
      setStreamName('');
      loadClasses(schoolId);
      toast.success(`Stream "${data.data.name}" added.`);
    } else {
      toast.error(data.message || 'Failed to add stream.');
    }
  };

  const handleDeleteStream = async (schoolId: string, classId: string, stream: Stream) => {
    const res = await fetch(`/api/admin/system/schools/${schoolId}/classes/${classId}/streams/${stream.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadClasses(schoolId);
      toast.success('Stream deleted.');
    } else {
      toast.error(data.message || 'Failed to delete stream.');
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Schools</h1>
      <p className="text-sm text-text-muted mb-6">Manage schools, their classes, and streams. Schools don&apos;t log in.</p>

      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-primary-700" /> Add school
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="School name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Kampala" />
            <Input label="Contact email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <Input label="Contact person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <Input label="Contact number" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
          </div>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button type="submit" isLoading={creating}>Create school</Button>
        </form>
      </Card>

      <h2 className="text-lg font-semibold text-primary-900 mb-4">Registered schools</h2>
      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : loadError ? (
        <p className="text-error">{loadError}</p>
      ) : schools.length === 0 ? (
        <p className="text-text-muted">No schools yet.</p>
      ) : (
        <div className="space-y-3">
          {schools.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bg-muted flex items-center justify-center shrink-0">
                    <SchoolIcon className="w-5 h-5 text-primary-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-primary-900">{s.name}</p>
                    <p className="text-xs text-text-faint font-mono">{s.systemId}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {[s.location, s.contactPerson, s.contactNumber, s.contactEmail].filter(Boolean).join(' • ') || 'No contact details on file'}
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => toggleManage(s.id)}>
                  <Layers className="w-4 h-4 mr-1" /> Classes
                </Button>
              </div>

              {managingId === s.id && (
                <div className="mt-4 pt-4 border-t border-primary-100 space-y-3">
                  {loadingClassesFor === s.id ? (
                    <p className="text-xs text-text-muted">Loading classes…</p>
                  ) : (classes[s.id] ?? []).length === 0 ? (
                    <p className="text-xs text-text-muted">No classes yet.</p>
                  ) : (
                    (classes[s.id] ?? []).map((cls) => (
                      <div key={cls.id} className="rounded-xl border border-primary-100 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-primary-900">{cls.name}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleToggleStreams(s.id, cls)}
                              className={`text-xs px-2.5 py-1 rounded-lg border ${cls.hasStreams ? 'border-primary-700/20 bg-primary-50 text-primary-700' : 'border-primary-100 text-text-muted'}`}
                            >
                              {cls.hasStreams ? 'Has streams' : 'No streams'}
                            </button>
                            <button onClick={() => handleDeleteClass(s.id, cls)} aria-label={`Delete ${cls.name}`} className="text-error/70 hover:text-error">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {cls.hasStreams && (
                          <div className="mt-2 pl-3 border-l-2 border-primary-100">
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {cls.streams.length === 0 ? (
                                <p className="text-xs text-text-faint">No streams yet.</p>
                              ) : (
                                cls.streams.map((st) => (
                                  <span key={st.id} className="inline-flex items-center gap-1.5 bg-bg-muted text-text-secondary text-xs px-2 py-1 rounded-lg">
                                    {st.name}
                                    <button onClick={() => handleDeleteStream(s.id, cls.id, st)} aria-label={`Delete stream ${st.name}`}>
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))
                              )}
                            </div>
                            {addingStreamFor === cls.id ? (
                              <div className="flex gap-2">
                                <input
                                  autoFocus
                                  value={streamName}
                                  onChange={(e) => setStreamName(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleAddStream(s.id, cls.id)}
                                  placeholder="Stream name, e.g. A"
                                  className="text-xs px-2.5 py-1.5 rounded-lg border border-primary-100 flex-1"
                                />
                                <Button variant="outline" className="text-xs px-3 py-1.5" onClick={() => handleAddStream(s.id, cls.id)}>Add</Button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAddingStreamFor(cls.id); setStreamName(''); }}
                                className="text-xs text-primary-700 hover:text-primary-800"
                              >
                                + Add stream
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  <div className="flex flex-wrap items-end gap-2 pt-1">
                    <input
                      value={classForm.name}
                      onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddClass(s.id)}
                      placeholder="New class name, e.g. P.1"
                      className="text-sm px-3 py-2 rounded-xl border border-primary-100 flex-1 min-w-[160px]"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-text-muted whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={classForm.hasStreams}
                        onChange={(e) => setClassForm({ ...classForm, hasStreams: e.target.checked })}
                      />
                      Has streams
                    </label>
                    <Button variant="outline" onClick={() => handleAddClass(s.id)}>Add class</Button>
                  </div>
                </div>
              )}

              {(!classes[s.id] || classes[s.id].length === 0) && managingId !== s.id && (
                <Badge variant="muted" className="mt-3">No classes configured yet</Badge>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
