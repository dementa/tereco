'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { useToast } from '@/components/ui/ToastProvider';
import { Layers, Pencil, Plus, Power, PowerOff, Trash2, X } from 'lucide-react';

interface School {
  id: string;
  systemId: string;
  name: string;
  location: string;
  phone: string;
  email: string | null;
  logoUrl: string | null;
  joinedOn: string | null;
  isActive: boolean;
  contactName: string | null;
}

interface Stream {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  level: number | null;
  alias: string | null;
  displayName: string;
  hasStreams: boolean;
  isActive: boolean;
  streams: Stream[];
}

interface GradeLevel {
  level: number;
  code: string;
  name: string;
}

/** One row of the ladder picker in the create-school form. */
interface LadderChoice {
  selected: boolean;
  alias: string;
  hasStreams: boolean;
}

const emptyForm = { name: '', location: '', phone: '', email: '', joinedOn: '' };

export default function SystemSchoolsPage() {
  const toast = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [levels, setLevels] = useState<GradeLevel[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [ladder, setLadder] = useState<Record<number, LadderChoice>>({});
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<School | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [managing, setManaging] = useState<School | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [streamName, setStreamName] = useState('');
  const [addingStreamFor, setAddingStreamFor] = useState<string | null>(null);
  const [customClass, setCustomClass] = useState({ alias: '', hasStreams: false });

  const load = useCallback(async () => {
    try {
      const [schoolsRes, levelsRes] = await Promise.all([
        fetch('/api/admin/system/schools').then((r) => r.json()),
        fetch('/api/admin/system/grade-levels').then((r) => r.json()),
      ]);
      if (schoolsRes.success) setSchools(schoolsRes.data);
      else toast.error(schoolsRes.message ?? 'Failed to load schools.');
      if (levelsRes.success) {
        setLevels(levelsRes.data);
        // Default every school to the full P.1-P.7 ladder: that is the norm,
        // and unticking two is less work than ticking seven.
        setLadder(
          Object.fromEntries(
            (levelsRes.data as GradeLevel[]).map((l) => [
              l.level,
              { selected: true, alias: '', hasStreams: false },
            ])
          )
        );
      }
    } catch {
      toast.error('Network error while loading schools.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    // Guard against setting state after the component unmounts mid-request.
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  function setChoice(level: number, patch: Partial<LadderChoice>) {
    setLadder((current) => ({ ...current, [level]: { ...current[level], ...patch } }));
  }

  const loadClasses = useCallback(
    async (schoolId: string) => {
      setClassesLoading(true);
      try {
        const res = await fetch(`/api/admin/system/schools/${schoolId}/classes`);
        const data = await res.json();
        if (data.success) setClasses(data.data);
        else toast.error(data.message ?? 'Failed to load classes.');
      } catch {
        toast.error('Network error loading classes.');
      } finally {
        setClassesLoading(false);
      }
    },
    [toast]
  );

  const openManage = useCallback(
    (school: School) => {
      setManaging(school);
      setClasses([]);
      setCustomClass({ alias: '', hasStreams: false });
      void loadClasses(school.id);
    },
    [loadClasses]
  );

  async function createSchool(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const chosen = levels
        .filter((l) => ladder[l.level]?.selected)
        .map((l) => ({
          level: l.level,
          alias: ladder[l.level].alias.trim() || undefined,
          hasStreams: ladder[l.level].hasStreams,
        }));

      const res = await fetch('/api/admin/system/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, classes: chosen }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${form.name} added with ${chosen.length} class(es). Add its logo below.`);
        setForm(emptyForm);
        setShowForm(false);
        await load();
        // Straight into edit: a logo cannot be uploaded until the school
        // exists (the asset is keyed on its id), and asking for it now beats
        // leaving papers unbranded until someone remembers.
        setEditing(data.data);
      } else {
        toast.error(data.message ?? 'Failed to create school.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/system/schools/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editing.name,
          location: editing.location,
          phone: editing.phone,
          email: editing.email ?? '',
          joinedOn: editing.joinedOn,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Update in place rather than refetching the whole list.
        setSchools((current) => current.map((s) => (s.id === data.data.id ? data.data : s)));
        setEditing(null);
        toast.success('School updated.');
      } else {
        toast.error(data.message ?? 'Failed to update school.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(school: School) {
    const next = !school.isActive;
    const res = await fetch(`/api/admin/system/schools/${school.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    });
    const data = await res.json();
    if (data.success) {
      setSchools((current) => current.map((s) => (s.id === school.id ? data.data : s)));
      toast.success(`${school.name} ${next ? 'reactivated' : 'deactivated'}.`);
    } else {
      toast.error(data.message ?? 'Failed to update school.');
    }
  }

  async function removeSchool(school: School) {
    if (
      !confirm(
        `Permanently delete ${school.name}? Its classes and streams go with it. This cannot be undone.`
      )
    )
      return;
    const res = await fetch(`/api/admin/system/schools/${school.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setSchools((current) => current.filter((s) => s.id !== school.id));
      if (managing?.id === school.id) setManaging(null);
      toast.success(`${school.name} deleted.`);
    } else {
      // The API refuses once a school has records and says what is in the way,
      // so surface that verbatim rather than a generic failure.
      toast.error(data.message ?? 'Failed to delete school.');
    }
  }

  async function addClass(body: Record<string, unknown>) {
    if (!managing) return;
    const res = await fetch(`/api/admin/system/schools/${managing.id}/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      await loadClasses(managing.id);
      toast.success('Class added.');
    } else {
      toast.error(data.message ?? 'Failed to add class.');
    }
  }

  async function patchClass(cls: SchoolClass, patch: Record<string, unknown>) {
    if (!managing) return;
    const res = await fetch(`/api/admin/system/schools/${managing.id}/classes/${cls.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.success) await loadClasses(managing.id);
    else toast.error(data.message ?? 'Failed to update class.');
  }

  async function deleteClass(cls: SchoolClass) {
    if (!managing) return;
    if (!confirm(`Delete class "${cls.displayName}"?`)) return;
    const res = await fetch(`/api/admin/system/schools/${managing.id}/classes/${cls.id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.success) {
      await loadClasses(managing.id);
      toast.success('Class deleted.');
    } else {
      toast.error(data.message ?? 'Failed to delete class.');
    }
  }

  async function addStream(cls: SchoolClass) {
    if (!managing || !streamName.trim()) return;
    const res = await fetch(
      `/api/admin/system/schools/${managing.id}/classes/${cls.id}/streams`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: streamName }),
      }
    );
    const data = await res.json();
    if (data.success) {
      setStreamName('');
      setAddingStreamFor(null);
      await loadClasses(managing.id);
      toast.success('Stream added.');
    } else {
      toast.error(data.message ?? 'Failed to add stream.');
    }
  }

  async function deleteStream(cls: SchoolClass, stream: Stream) {
    if (!managing) return;
    const res = await fetch(
      `/api/admin/system/schools/${managing.id}/classes/${cls.id}/streams/${stream.id}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (data.success) {
      await loadClasses(managing.id);
      toast.success('Stream removed.');
    } else {
      toast.error(data.message ?? 'Failed to remove stream.');
    }
  }

  const columns: DataTableColumn<School>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'School',
        value: (s) => s.name,
        render: (s) => (
          <span className="inline-flex items-center gap-2.5">
            {s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.logoUrl}
                alt=""
                className="w-7 h-7 rounded object-contain bg-[#F1F6F8] shrink-0"
              />
            ) : (
              <span
                className="w-7 h-7 rounded bg-[#F1F6F8] text-[#9BB3BD] text-[9px] flex items-center justify-center shrink-0"
                title="No logo — add one so it appears on question papers"
              >
                no logo
              </span>
            )}
            <span className="font-medium">{s.name}</span>
            {!s.isActive && <Badge variant="muted">Inactive</Badge>}
          </span>
        ),
      },
      { key: 'systemId', header: 'ID', value: (s) => s.systemId },
      { key: 'location', header: 'Location', value: (s) => s.location || '—' },
      { key: 'phone', header: 'Phone', value: (s) => s.phone || '—', hideOnMobile: true },
      { key: 'email', header: 'Email', value: (s) => s.email ?? '—', hideOnMobile: true },
      {
        key: 'contactName',
        header: 'Contact person',
        value: (s) => s.contactName ?? '—',
        hideOnMobile: true,
      },
      {
        key: 'manage',
        header: '',
        sortable: false,
        align: 'right',
        render: (s) => (
          <div className="flex justify-end items-center gap-1">
            <button
              type="button"
              onClick={() => openManage(s)}
              title={`Classes and streams for ${s.name}`}
              className="p-1.5 rounded-lg text-[#02465B] hover:bg-[#F1F6F8]"
            >
              <Layers className="w-4 h-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setEditing(s)}
              title={`Edit ${s.name}`}
              className="p-1.5 rounded-lg text-[#02465B] hover:bg-[#F1F6F8]"
            >
              <Pencil className="w-4 h-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void toggleActive(s)}
              title={s.isActive ? `Deactivate ${s.name}` : `Reactivate ${s.name}`}
              className="p-1.5 rounded-lg text-[#5A7D8A] hover:bg-[#F1F6F8]"
            >
              {s.isActive ? (
                <PowerOff className="w-4 h-4" aria-hidden />
              ) : (
                <Power className="w-4 h-4" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => void removeSchool(s)}
              title={`Delete ${s.name}`}
              className="p-1.5 rounded-lg text-[#C26565] hover:bg-[#FBF0F0]"
            >
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openManage]
  );

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Schools</h1>
        <p className="text-sm text-text-muted">
          Classes follow the fixed P.1–P.7 ladder so every school&apos;s data can be compared. A
          school that calls P.1 something else gives it a display name — the underlying level stays
          the same.
        </p>
      </div>

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">New school</h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>

          <form onSubmit={createSchool} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="name"
                label="School name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                id="location"
                label="Location"
                placeholder="e.g. Kampala"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
              <Input
                id="phone"
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Input
                id="email"
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                id="joinedOn"
                label="Joined the programme on"
                type="date"
                value={form.joinedOn}
                onChange={(e) => setForm({ ...form, joinedOn: e.target.value })}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-[#5A7D8A] tracking-wide mb-2">
                Classes this school runs
              </p>
              <div className="rounded-xl border border-[#E8EFF3] divide-y divide-[#F1F6F8]">
                {levels.map((level) => {
                  const choice = ladder[level.level] ?? {
                    selected: false,
                    alias: '',
                    hasStreams: false,
                  };
                  return (
                    <div
                      key={level.level}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 p-3"
                    >
                      <label className="flex items-center gap-2 sm:w-32 shrink-0 text-sm">
                        <input
                          type="checkbox"
                          checked={choice.selected}
                          onChange={(e) => setChoice(level.level, { selected: e.target.checked })}
                          className="rounded border-[#D1E0E8]"
                        />
                        <span className="font-medium text-[#12333F]">{level.code}</span>
                      </label>

                      <input
                        type="text"
                        value={choice.alias}
                        disabled={!choice.selected}
                        onChange={(e) => setChoice(level.level, { alias: e.target.value })}
                        placeholder={`Display name (optional) — e.g. J${level.level}`}
                        aria-label={`Display name for ${level.code}`}
                        className="flex-1 rounded-lg border-2 border-[#D1E0E8] bg-white px-3 py-1.5 text-sm disabled:bg-[#F8FBFC] disabled:text-[#9BB3BD] focus:border-[#02465B] focus:outline-none"
                      />

                      <label className="flex items-center gap-2 text-sm text-[#5A7D8A] shrink-0">
                        <input
                          type="checkbox"
                          checked={choice.hasStreams}
                          disabled={!choice.selected}
                          onChange={(e) => setChoice(level.level, { hasStreams: e.target.checked })}
                          className="rounded border-[#D1E0E8]"
                        />
                        Has streams
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-text-muted mt-2">
                Streams (Bright, Clever, A/B) can be added per class after the school is created.
              </p>
            </div>

            <Button type="submit" isLoading={creating}>
              Create school
            </Button>
          </form>
        </Card>
      )}

      <DataTable
        rows={schools}
        columns={columns}
        rowKey={(s) => s.id}
        loading={loading}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search schools by name, ID or location…"
        emptyMessage="No schools yet. Add one to get started."
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
            matches: (s, v) => (v === 'active' ? s.isActive : !s.isActive),
          },
        ]}
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            New school
          </Button>
        }
      />

      {editing && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">Edit — {editing.systemId}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="School name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
              <Input
                label="Location"
                value={editing.location}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              />
              <Input
                label="Phone"
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
              <Input
                label="Email"
                type="email"
                value={editing.email ?? ''}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
              <Input
                label="Joined the programme on"
                type="date"
                value={editing.joinedOn ?? ''}
                onChange={(e) => setEditing({ ...editing, joinedOn: e.target.value })}
              />
            </div>
            <ImageUpload
              kind="school"
              entityId={editing.id}
              value={editing.logoUrl}
              label="School logo — printed on question papers and result sheets"
              size={80}
              onChange={(url) => {
                setEditing({ ...editing, logoUrl: url });
                setSchools((current) =>
                  current.map((s) => (s.id === editing.id ? { ...s, logoUrl: url } : s))
                );
              }}
            />
            <p className="text-xs text-text-muted">
              The contact person is set from a staff account at this school, on the Staff page.
            </p>
            <div className="flex gap-2">
              <Button type="submit" isLoading={savingEdit}>
                Save changes
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {managing && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">Classes — {managing.name}</h2>
            <button type="button" onClick={() => setManaging(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>

          {classesLoading ? (
            <p className="text-sm text-text-muted">Loading classes…</p>
          ) : (
            <div className="space-y-2">
              {classes.length === 0 && (
                <p className="text-sm text-text-muted">No classes configured yet.</p>
              )}

              {classes.map((cls) => (
                <div key={cls.id} className="rounded-xl border border-[#E8EFF3] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#12333F]">{cls.displayName}</span>
                    {cls.level !== null && cls.alias && (
                      <Badge variant="muted">Level {cls.level}</Badge>
                    )}
                    {cls.level === null && <Badge variant="accent">Off-ladder</Badge>}

                    <div className="ml-auto flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-[#5A7D8A]">
                        <input
                          type="checkbox"
                          checked={cls.hasStreams}
                          onChange={() => void patchClass(cls, { hasStreams: !cls.hasStreams })}
                          className="rounded border-[#D1E0E8]"
                        />
                        Streams
                      </label>
                      <button
                        type="button"
                        onClick={() => void deleteClass(cls)}
                        className="text-[#C26565] hover:text-[#A34C4C]"
                        title={`Delete ${cls.displayName}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {cls.hasStreams && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {cls.streams.map((stream) => (
                        <span
                          key={stream.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#F1F6F8] px-2 py-1 text-xs text-[#12333F]"
                        >
                          {stream.name}
                          <button
                            type="button"
                            onClick={() => void deleteStream(cls, stream)}
                            aria-label={`Remove stream ${stream.name}`}
                            className="text-[#5A7D8A] hover:text-[#C26565]"
                          >
                            <X className="w-3 h-3" aria-hidden />
                          </button>
                        </span>
                      ))}

                      {addingStreamFor === cls.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            value={streamName}
                            onChange={(e) => setStreamName(e.target.value)}
                            placeholder="Stream name"
                            aria-label="Stream name"
                            className="rounded-lg border-2 border-[#D1E0E8] px-2 py-1 text-xs focus:border-[#02465B] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void addStream(cls)}
                            className="text-xs text-[#02465B] hover:underline"
                          >
                            Add
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingStreamFor(cls.id);
                            setStreamName('');
                          }}
                          className="text-xs text-[#02465B] hover:underline"
                        >
                          + Add stream
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div className="pt-3 border-t border-[#F1F6F8] flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                  <label
                    htmlFor="customClass"
                    className="text-xs font-medium text-[#5A7D8A] tracking-wide"
                  >
                    Add an off-ladder class (e.g. ELITE)
                  </label>
                  <input
                    id="customClass"
                    type="text"
                    value={customClass.alias}
                    onChange={(e) => setCustomClass({ ...customClass, alias: e.target.value })}
                    placeholder="Class name"
                    className="mt-1.5 w-full rounded-xl border-2 border-[#D1E0E8] px-3 py-2 text-sm focus:border-[#02465B] focus:outline-none"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!customClass.alias.trim()) return;
                    void addClass({
                      level: null,
                      alias: customClass.alias.trim(),
                      hasStreams: customClass.hasStreams,
                    });
                    setCustomClass({ alias: '', hasStreams: false });
                  }}
                >
                  Add class
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
