'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, ChevronRight } from 'lucide-react';

export type SortField = 'name' | 'created';
export type SortDir = 'asc' | 'desc';

const FIELD_LABEL: Record<SortField, string> = {
  name: 'name',
  created: 'creation date',
};

const FIELDS: SortField[] = ['name', 'created'];
const DIRS: SortDir[] = ['asc', 'desc'];

/**
 * "Sorted by ⌄" toolbar control with a nested Sort by / Ascending-Descending
 * flyout — the two-level menu Supabase uses on its list pages. Click-driven
 * rather than hover-driven so it works the same on touch as on desktop.
 */
export function SortMenu({
  field,
  dir,
  onChange,
}: {
  field: SortField;
  dir: SortDir;
  onChange: (field: SortField, dir: SortDir) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<SortField | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setSubmenu(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setSubmenu(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setSubmenu(null);
        }}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-bg-card px-2.5 text-sm transition-colors hover:border-text-faint ${
          open ? 'border-text-faint' : ''
        }`}
      >
        <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden />
        <span className="text-text-muted">Sorted by</span>
        <span className="font-medium text-text-primary">{FIELD_LABEL[field]}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-border-strong bg-bg-card p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        >
          {FIELDS.map((f) => (
            <div key={f} className="relative">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={submenu === f}
                onClick={() => setSubmenu((v) => (v === f ? null : f))}
                className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm whitespace-nowrap text-text-secondary transition-colors hover:bg-bg-muted ${
                  submenu === f ? 'bg-bg-muted' : ''
                }`}
              >
                Sort by {FIELD_LABEL[f]}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
              </button>

              {submenu === f && (
                <div
                  role="menu"
                  className="absolute left-full top-0 z-40 ml-1 w-40 rounded-xl border border-border-strong bg-bg-card p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
                >
                  {DIRS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onChange(f, d);
                        setOpen(false);
                        setSubmenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-muted"
                    >
                      <span className="flex h-3.5 w-3.5 items-center justify-center">
                        {field === f && dir === d && (
                          <span className="h-1.5 w-1.5 rounded-full bg-text-primary" aria-hidden />
                        )}
                      </span>
                      {d === 'asc' ? 'Ascending' : 'Descending'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
