'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import { ClipboardList, Plus, X } from 'lucide-react';

interface AssessmentTarget {
  id: string;
  schoolId: string | null;
  level: number | null;
  classId: string | null;
}

interface Assessment {
  id: string;
  systemId: string;
  title: string;
  description: string;
  timeLimit: number;
  opensAt?: string;
  closesAt?: string;
  status: 'draft' | 'published' | 'closed';
  targets: AssessmentTarget[];
}

const emptyForm = {
  title: '',
  description: '',
  timeLimit: 30,
  opensAt: '',
  closesAt: '',
};

const STATUS_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'muted'> = {
  draft: 'muted',
  published: 'success',
  closed: 'default',
};

function formatWindow(a: Assessment): string {
  if (!a.opensAt && !a.closesAt) return 'Always open';
  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  return `${fmt(a.opensAt)} → ${fmt(a.closesAt)}`;
}

export default function AdminAssessments() {
  const router = useRouter();
  const toast = useToast();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/assessments');
      const data = await res.json();
      if (data.success) setAssessments(data.data);
      else toast.error(data.message ?? 'Failed to load assessments.');
    } catch {
      toast.error('Network error while loading assessments.');
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          timeLimit: Number(form.timeLimit),
          opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : undefined,
          closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${form.title} created as a draft.`);
        setForm(emptyForm);
        setShowForm(false);
        // Straight into the editor — a new assessment has no questions or
        // audience yet, so the list view has nothing useful to show for it.
        router.push(`/admin/assessments/${data.data.id}`);
      } else {
        toast.error(data.message ?? 'Failed to create assessment.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setCreating(false);
    }
  }

  const columns: DataTableColumn<Assessment>[] = useMemo(
    () => [
      {
        key: 'title',
        header: 'Assessment',
        value: (a) => a.title,
        render: (a) => (
          <span className="min-w-0">
            <span className="font-medium block truncate">{a.title}</span>
            <span className="text-xs text-text-muted">{a.systemId}</span>
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        value: (a) => a.status,
        render: (a) => <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>,
      },
      {
        key: 'audience',
        header: 'Audience',
        sortable: false,
        // No targets means every student — the absence IS the rule, so it has
        // to read as a deliberate state rather than a blank cell.
        value: (a) => (a.targets.length === 0 ? 'All students' : `${a.targets.length}`),
        render: (a) =>
          a.targets.length === 0 ? (
            <span className="text-[#5A7D8A]">All students</span>
          ) : (
            `${a.targets.length} target${a.targets.length === 1 ? '' : 's'}`
          ),
      },
      { key: 'timeLimit', header: 'Minutes', value: (a) => a.timeLimit, align: 'right' },
      {
        key: 'window',
        header: 'Window',
        value: (a) => a.opensAt ?? '',
        render: (a) => <span className="text-xs">{formatWindow(a)}</span>,
        hideOnMobile: true,
      },
    ],
    []
  );

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Assessments</h1>
        <p className="text-sm text-text-muted">
          Create a paper, set its questions and audience, then publish it. Students may sit each
          assessment once.
        </p>
      </div>

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary-700" aria-hidden /> New assessment
            </h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
              <X className="w-4 h-4 text-text-muted" aria-hidden />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Time limit (minutes)"
                type="number"
                min={1}
                value={form.timeLimit}
                onChange={(e) => setForm({ ...form, timeLimit: Number(e.target.value) })}
                required
              />
              <Input
                label="Opens at (optional)"
                type="datetime-local"
                value={form.opensAt}
                onChange={(e) => setForm({ ...form, opensAt: e.target.value })}
              />
              <Input
                label="Closes at (optional)"
                type="datetime-local"
                value={form.closesAt}
                onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
              />
            </div>
            <p className="text-xs text-text-muted">
              Created as a draft — students cannot see it until you publish. Questions and audience
              are set on the next screen.
            </p>
            <Button type="submit" isLoading={creating}>
              Create and add questions
            </Button>
          </form>
        </Card>
      )}

      <DataTable
        rows={assessments}
        columns={columns}
        rowKey={(a) => a.id}
        loading={loading}
        initialSort={{ key: 'title', direction: 'asc' }}
        searchPlaceholder="Search assessments by title or ID…"
        emptyMessage="No assessments yet."
        mobileTitle={(a) => a.title}
        onRowClick={(a) => router.push(`/admin/assessments/${a.systemId}`)}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
              { value: 'closed', label: 'Closed' },
            ],
            matches: (a, v) => a.status === v,
          },
        ]}
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            New assessment
          </Button>
        }
      />
    </div>
  );
}
