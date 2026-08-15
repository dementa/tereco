'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastProvider';
import { ClipboardList, Eye, EyeOff, Plus, Search, X } from 'lucide-react';
import { AssessmentCard, type CardAssessment } from '@/components/assessment/AssessmentCard';
import { AssessmentTable } from '@/components/assessment/AssessmentTable';
import { MarkingProgressPanel } from '@/components/admin/MarkingProgressPanel';
import { SortMenu, type SortDir, type SortField } from '@/components/ui/SortMenu';
import { ViewToggle, type ListView } from '@/components/ui/ViewToggle';
import { useAuth } from '@/components/auth/AuthContext';

const emptyForm = {
  title: '',
  description: '',
  timeLimit: 30,
  opensAt: '',
  closesAt: '',
};

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
];

export default function AdminAssessments() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [assessments, setAssessments] = useState<CardAssessment[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [levels, setLevels] = useState<{ level: number; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // 'created'/'desc' matches the API's own default order (newest first), so
  // picking these as the initial state changes nothing until someone opens
  // the sort menu.
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [view, setView] = useState<ListView>('card');
  // super_admin-only: reveals assessments an earlier "Hide" hid from
  // everyone else, including this same list by default.
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const assessmentsUrl =
        isSuperAdmin && showHidden ? '/api/admin/assessments?hidden=1' : '/api/admin/assessments';
      const [assessmentsRes, schoolsRes, levelsRes] = await Promise.all([
        fetch(assessmentsUrl).then((r) => r.json()),
        fetch('/api/admin/system/schools').then((r) => r.json()),
        fetch('/api/admin/system/grade-levels').then((r) => r.json()),
      ]);
      if (assessmentsRes.success) setAssessments(assessmentsRes.data);
      else toast.error(assessmentsRes.message ?? 'Failed to load assessments.');
      if (schoolsRes.success) setSchools(schoolsRes.data);
      if (levelsRes.success) setLevels(levelsRes.data);
    } catch {
      toast.error('Network error while loading assessments.');
    } finally {
      setLoading(false);
    }
  }, [toast, isSuperAdmin, showHidden]);

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

  async function handleDuplicate(a: CardAssessment) {
    try {
      const res = await fetch(`/api/admin/assessments/${a.systemId}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message ?? 'Duplicated.');
        router.push(`/admin/assessments/${data.data.systemId}`);
      } else {
        toast.error(data.message ?? 'Could not duplicate that assessment.');
      }
    } catch {
      toast.error('Network error.');
    }
  }

  async function handleDelete(a: CardAssessment) {
    if (!confirm(`Delete "${a.title}"? This cannot be undone from here.`)) return;
    const res = await fetch(`/api/admin/assessments/${a.systemId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast.success('Assessment deleted.');
      setAssessments((prev) => prev.filter((x) => x.systemId !== a.systemId));
    } else {
      toast.error(data.message ?? 'Could not delete the assessment.');
    }
  }

  async function handleToggleHidden(a: CardAssessment) {
    const nextHidden = !a.hiddenAt;
    const res = await fetch(`/api/admin/assessments/${a.systemId}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: nextHidden }),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.message ?? 'Could not update visibility.');
      return;
    }
    toast.success(nextHidden ? 'Assessment hidden from everyone else.' : 'Assessment unhidden.');
    // Hiding it while not showing hidden ones drops it from view entirely,
    // same as any other filter change — no need for a second fetch.
    setAssessments((prev) =>
      nextHidden && !showHidden
        ? prev.filter((x) => x.systemId !== a.systemId)
        : prev.map((x) => (x.systemId === a.systemId ? { ...x, hiddenAt: nextHidden ? new Date().toISOString() : undefined } : x))
    );
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = assessments.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (q && !a.title.toLowerCase().includes(q) && !a.systemId.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sortField === 'name') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      if (sortDir === 'desc') sorted.reverse();
    } else if (sortDir === 'asc') {
      // 'created': the API already returns newest-first, so descending needs
      // no work and ascending is just that order reversed.
      sorted.reverse();
    }
    return sorted;
  }, [assessments, search, statusFilter, sortField, sortDir]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 space-y-4">
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

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative w-full md:w-64 shrink-0">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assessments by title or ID…"
              aria-label="Search assessments"
              className="w-full h-9 rounded-lg border border-border-strong bg-bg-card pl-9 pr-3 text-sm transition-colors focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/15"
            />
          </div>

          <select
            aria-label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`h-9 shrink-0 rounded-lg border border-border-strong bg-bg-card px-2.5 text-sm transition-colors focus:border-primary-700 focus:outline-none ${
              statusFilter !== 'all' ? 'text-text-primary font-medium' : 'text-text-muted'
            }`}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <SortMenu
            field={sortField}
            dir={sortDir}
            onChange={(f, d) => {
              setSortField(f);
              setSortDir(d);
            }}
          />

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              aria-pressed={showHidden}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors ${
                showHidden
                  ? 'border-primary-700 bg-primary-50 text-primary-700'
                  : 'border-border-strong bg-bg-card text-text-muted hover:border-text-faint'
              }`}
            >
              {showHidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
              Show hidden
            </button>
          )}

          <div className="flex items-center gap-2 md:ml-auto">
            <ViewToggle view={view} onChange={setView} />
            <Button onClick={() => setShowForm((v) => !v)} inline>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden />
              New assessment
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-text-muted">No assessments yet.</p>
        ) : view === 'card' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((a) => (
              <AssessmentCard
                key={a.id}
                assessment={a}
                schools={schools}
                levels={levels}
                onClick={() => router.push(`/admin/assessments/${a.systemId}`)}
                onDuplicate={() => void handleDuplicate(a)}
                onDelete={() => void handleDelete(a)}
                onToggleHidden={() => void handleToggleHidden(a)}
              />
            ))}
          </div>
        ) : (
          <AssessmentTable
            assessments={visible}
            schools={schools}
            levels={levels}
            onRowClick={(a) => router.push(`/admin/assessments/${a.systemId}`)}
            onDuplicate={(a) => void handleDuplicate(a)}
            onDelete={(a) => void handleDelete(a)}
            onToggleHidden={(a) => void handleToggleHidden(a)}
          />
        )}
      </div>

      {isSuperAdmin && (
        <div className="w-full lg:w-80 shrink-0">
          <MarkingProgressPanel />
        </div>
      )}
    </div>
  );
}
