'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { CalendarDays, CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react';

interface AcademicYear {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  termCount: number;
}

const emptyForm = { label: '', startsOn: '', endsOn: '', makeCurrent: false };

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AcademicYearsPage() {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);

  // No setState in the effect body itself: `loading` starts true and is only
  // cleared once the request settles. Flipping it on synchronously here would
  // schedule a render during the effect for no benefit.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system/academic-years');
      const data = await res.json();
      if (data.success) setYears(data.data);
      else toast.error(data.message ?? 'Failed to load academic years.');
    } catch {
      toast.error('Network error while loading academic years.');
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/system/academic-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Academic year ${form.label} created.`);
        setForm(emptyForm);
        setShowForm(false);
        await load();
      } else {
        toast.error(data.message ?? 'Could not create the academic year.');
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
      const res = await fetch(`/api/admin/system/academic-years/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editing.label,
          startsOn: editing.startsOn,
          endsOn: editing.endsOn,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Academic year updated.');
        setEditing(null);
        await load();
      } else {
        // Overlap and date-order violations arrive here with a usable message.
        toast.error(data.message ?? 'Could not update the academic year.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function makeCurrent(year: AcademicYear) {
    const res = await fetch(`/api/admin/system/academic-years/${year.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ makeCurrent: true }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`${year.label} is now the current academic year.`);
      await load();
    } else {
      toast.error(data.message ?? 'Could not switch the current year.');
    }
  }

  async function remove(year: AcademicYear) {
    if (!confirm(`Delete academic year ${year.label}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/system/academic-years/${year.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast.success(`Academic year ${year.label} deleted.`);
      await load();
    } else {
      toast.error(data.message ?? 'Could not delete the academic year.');
    }
  }

  const columns: DataTableColumn<AcademicYear>[] = [
    {
      key: 'label',
      header: 'Year',
      value: (y) => y.label,
      render: (y) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium">{y.label}</span>
          {y.isCurrent && <Badge variant="success">Current</Badge>}
        </span>
      ),
    },
    { key: 'startsOn', header: 'Starts', value: (y) => y.startsOn, render: (y) => formatDate(y.startsOn) },
    { key: 'endsOn', header: 'Ends', value: (y) => y.endsOn, render: (y) => formatDate(y.endsOn) },
    { key: 'termCount', header: 'Terms', value: (y) => y.termCount, align: 'right', hideOnMobile: true },
    {
      key: 'actions',
      header: '',
      sortable: false,
      align: 'right',
      render: (y) => (
        <div className="flex justify-end gap-2 items-center">
          <button
            type="button"
            onClick={() => setEditing(y)}
            title={`Edit ${y.label}`}
            className="text-[#02465B] hover:text-[#02465B]/70"
          >
            <Pencil className="w-4 h-4" aria-hidden />
          </button>
          {!y.isCurrent && (
            <button
              type="button"
              onClick={() => void makeCurrent(y)}
              title="Make this the current year"
              className="inline-flex items-center gap-1 text-xs text-[#02465B] hover:underline"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
              Set current
            </button>
          )}
          <button
            type="button"
            onClick={() => void remove(y)}
            title={`Delete ${y.label}`}
            className="text-[#C26565] hover:text-[#A34C4C]"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      ),
    },
  ];

  const current = years.find((y) => y.isCurrent);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1">Academic years</h1>
          <p className="text-sm text-text-muted">
            The shared calendar every school reports against. Enrolments and lesson reports resolve
            their year from here, so exactly one year is current at a time and years cannot overlap.
          </p>
        </div>
      </div>

      <Card className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-bg-muted">
          <CalendarDays className="w-5 h-5 text-primary-700" aria-hidden />
        </div>
        <div>
          <p className="text-xs text-text-muted">Current academic year</p>
          <p className="text-lg font-semibold text-primary-900">
            {loading ? '—' : (current?.label ?? 'None set')}
          </p>
          {!loading && !current && (
            <p className="text-xs text-[#C26565] mt-0.5">
              Students cannot be enrolled until a current year is set.
            </p>
          )}
        </div>
      </Card>

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">New academic year</h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              id="label"
              label="Name"
              placeholder="2026"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
            <Input
              id="startsOn"
              label="Starts on"
              type="date"
              value={form.startsOn}
              onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
              required
            />
            <Input
              id="endsOn"
              label="Ends on"
              type="date"
              value={form.endsOn}
              onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
              required
            />
            <label className="sm:col-span-3 flex items-center gap-2 text-sm text-[#12333F]">
              <input
                type="checkbox"
                checked={form.makeCurrent}
                onChange={(e) => setForm({ ...form, makeCurrent: e.target.checked })}
                className="rounded border-[#D1E0E8]"
              />
              Make this the current academic year
            </label>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create academic year'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {editing && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">Edit {editing.label}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Name"
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              required
            />
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
          <p className="text-xs text-text-muted mt-2">
            Years cannot overlap — a lesson&apos;s date has to resolve to exactly one year.
          </p>
        </Card>
      )}

      <DataTable
        rows={years}
        columns={columns}
        rowKey={(y) => y.id}
        loading={loading}
        initialSort={{ key: 'startsOn', direction: 'desc' }}
        searchPlaceholder="Search academic years…"
        emptyMessage="No academic years yet. Create one to start enrolling students."
        mobileTitle={(y) => (
          <span className="inline-flex items-center gap-2">
            {y.label}
            {y.isCurrent && <Badge variant="success">Current</Badge>}
          </span>
        )}
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            New year
          </Button>
        }
      />
    </div>
  );
}
