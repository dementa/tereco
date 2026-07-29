'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { Trash2, X } from 'lucide-react';

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

export default function SchoolAdminClassesPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamName, setStreamName] = useState('');
  const [addingStreamFor, setAddingStreamFor] = useState<string | null>(null);
  const [customClass, setCustomClass] = useState({ alias: '', hasStreams: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school-admin/classes');
      const data = await res.json();
      if (data.success) setClasses(data.data);
      else toast.error(data.message ?? 'Failed to load classes.');
    } catch {
      toast.error('Network error loading classes.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function addClass(body: Record<string, unknown>) {
    const res = await fetch('/api/school-admin/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      await load();
      toast.success('Class added.');
    } else {
      toast.error(data.message ?? 'Failed to add class.');
    }
  }

  async function patchClass(cls: SchoolClass, patch: Record<string, unknown>) {
    const res = await fetch(`/api/school-admin/classes/${cls.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.success) await load();
    else toast.error(data.message ?? 'Failed to update class.');
  }

  async function deleteClass(cls: SchoolClass) {
    if (!confirm(`Delete class "${cls.displayName}"?`)) return;
    const res = await fetch(`/api/school-admin/classes/${cls.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await load();
      toast.success('Class deleted.');
    } else {
      toast.error(data.message ?? 'Failed to delete class.');
    }
  }

  async function addStream(cls: SchoolClass) {
    if (!streamName.trim()) return;
    const res = await fetch(`/api/school-admin/classes/${cls.id}/streams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: streamName }),
    });
    const data = await res.json();
    if (data.success) {
      setStreamName('');
      setAddingStreamFor(null);
      await load();
      toast.success('Stream added.');
    } else {
      toast.error(data.message ?? 'Failed to add stream.');
    }
  }

  async function deleteStream(cls: SchoolClass, stream: Stream) {
    const res = await fetch(`/api/school-admin/classes/${cls.id}/streams/${stream.id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.success) {
      await load();
      toast.success('Stream removed.');
    } else {
      toast.error(data.message ?? 'Failed to remove stream.');
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Classes & Streams</h1>
        <p className="text-sm text-text-muted">
          The classes your school runs, and their streams (Bright, Clever, A/B).
        </p>
      </div>

      <Card>
        {loading ? (
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
                  {cls.level !== null && cls.alias && <Badge variant="muted">Level {cls.level}</Badge>}
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
                <label htmlFor="customClass" className="text-xs font-medium text-[#5A7D8A] tracking-wide">
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
                  void addClass({ level: null, alias: customClass.alias.trim(), hasStreams: customClass.hasStreams });
                  setCustomClass({ alias: '', hasStreams: false });
                }}
              >
                Add class
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
