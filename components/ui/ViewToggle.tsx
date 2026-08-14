'use client';

import { LayoutGrid, List } from 'lucide-react';

export type ListView = 'card' | 'table';

/**
 * The grid/list icon pair Supabase puts next to its sort control — swaps a
 * list between the card grid and the row-per-item table without touching
 * search/filter/sort state, which lives above this and stays put either way.
 */
export function ViewToggle({ view, onChange }: { view: ListView; onChange: (view: ListView) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border-strong bg-bg-card p-0.5 shrink-0">
      <button
        type="button"
        aria-label="Card view"
        aria-pressed={view === 'card'}
        onClick={() => onChange('card')}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
          view === 'card' ? 'bg-bg-muted text-text-primary' : 'text-text-muted hover:text-text-primary'
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Table view"
        aria-pressed={view === 'table'}
        onClick={() => onChange('table')}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
          view === 'table' ? 'bg-bg-muted text-text-primary' : 'text-text-muted hover:text-text-primary'
        }`}
      >
        <List className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
