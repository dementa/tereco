'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastProvider';
import { Pencil, Plus, Trash2 } from 'lucide-react';

interface Term {
  id: string;
  academicYearId: string;
  number: number;
  name: string;
  startsOn: string;
  endsOn: string;
}

interface TermsManagerProps {
  /** Fully scoped — e.g. "/api/school-admin/terms" or "/api/admin/system/schools/<id>/terms". */
  apiBasePath: string;
  academicYearId: string;
  /** Hides add/edit/delete — for a school_admin, whose terms API is view-only (creating/editing/deleting a term is super_admin-only). */
  readOnly?: boolean;
}

const emptyForm = { number: 1, name: '', startsOn: '', endsOn: '' };

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Terms CRUD for one school + one academic year — mirrors the create/edit/
 * delete-with-confirm pattern in app/admin/system/academic-years/page.tsx.
 * Shared between the school-admin terms page (own school) and the
 * super-admin academic-years page (school picker + this, per selected school).
 */
export function TermsManager({ apiBasePath, academicYearId, readOnly = false }: TermsManagerProps) {
  const toast = useToast();
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Term | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}?academicYearId=${academicYearId}`);
      const data = await res.json();
      if (data.success) setTerms(data.data);
      else toast.error(data.message ?? 'Failed to load terms.');
    } catch {
      toast.error('Network error while loading terms.');
    } finally {
      setLoading(false);
    }
  }, [apiBasePath, academicYearId, toast]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(apiBasePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, academicYearId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Term created.');
        setForm(emptyForm);
        setShowForm(false);
        await load();
      } else {
        toast.error(data.message ?? 'Could not create the term.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBasePath}/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editing.name, startsOn: editing.startsOn, endsOn: editing.endsOn }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Term updated.');
        setEditing(null);
        await load();
      } else {
        toast.error(data.message ?? 'Could not update the term.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(term: Term) {
    if (!confirm(`Delete Term ${term.number}? This cannot be undone.`)) return;
    const res = await fetch(`${apiBasePath}/${term.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast.success('Term deleted.');
      await load();
    } else {
      toast.error(data.message ?? 'Could not delete the term.');
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-text-muted">Loading terms…</p>
      ) : terms.length === 0 ? (
        <p className="text-sm text-text-muted">No terms defined for this year yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {terms.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between text-sm py-1.5 border-b border-primary-50 last:border-0"
            >
              <span className="text-text-primary">
                Term {t.number}
                {t.name ? ` — ${t.name}` : ''}
              </span>
              <span className="flex items-center gap-3 text-text-secondary">
                {formatDate(t.startsOn)} – {formatDate(t.endsOn)}
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(t)}
                      title="Edit"
                      className="text-primary-700 hover:text-primary-700/70"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(t)}
                      title="Delete"
                      className="text-error hover:text-error/70"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
          <div>
            <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">Term number</label>
            <select
              value={form.number}
              onChange={(e) => setForm({ ...form, number: Number(e.target.value) })}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
          <Input
            label="Name (optional)"
            placeholder="Term 1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Starts on"
            type="date"
            value={form.startsOn}
            onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
            required
          />
          <Input
            label="Ends on"
            type="date"
            value={form.endsOn}
            onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
            required
          />
          <div className="sm:col-span-4 flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Add term'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {!readOnly && editing && (
        <form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
          <Input label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <Input
            label="Starts on"
            type="date"
            value={editing.startsOn}
            onChange={(e) => setEditing({ ...editing, startsOn: e.target.value })}
            required
          />
          <Input
            label="Ends on"
            type="date"
            value={editing.endsOn}
            onChange={(e) => setEditing({ ...editing, endsOn: e.target.value })}
            required
          />
          <div className="sm:col-span-3 flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {!readOnly && !showForm && !editing && terms.length < 3 && (
        <Button variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-1.5" aria-hidden />
          Add term
        </Button>
      )}
    </div>
  );
}
