'use client';

import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export interface DataTableColumn<T> {
  /** Stable key, also used as the sort key. */
  key: string;
  header: string;
  /** What to render in the cell. Defaults to the searchable value. */
  render?: (row: T) => React.ReactNode;
  /**
   * The plain value used for searching and sorting. Return a number for
   * numeric ordering; strings compare case-insensitively.
   */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  /** Hide below the `sm` breakpoint — the card layout shows it regardless. */
  hideOnMobile?: boolean;
  align?: 'left' | 'right';
  className?: string;
}

export interface DataTableFilter<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Whether a row passes the chosen option. */
  matches: (row: T, value: string) => boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  filters?: DataTableFilter<T>[];
  /** Column key to sort by on first render. */
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  /** Rendered to the right of the search box (e.g. a "New" button). */
  actions?: React.ReactNode;
  /** Headline for each card in the mobile layout. Defaults to the first column. */
  mobileTitle?: (row: T) => React.ReactNode;
}

function defaultValue<T>(row: T, column: DataTableColumn<T>): string | number | null | undefined {
  if (column.value) return column.value(row);
  const candidate = (row as Record<string, unknown>)[column.key];
  return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : undefined;
}

function asSearchText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).toLowerCase();
}

/**
 * Table with search, sorting, filtering and pagination, responsive down to
 * phones — below `sm` it becomes a list of cards, because a horizontally
 * scrolling table is unusable on a handset and this app is used on them.
 *
 * Filtering happens client-side on the rows it is given. That is deliberate for
 * the console's list sizes (hundreds, not millions) and keeps the component
 * usable without every caller implementing a query protocol.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  filters = [],
  initialSort,
  searchPlaceholder = 'Search…',
  emptyMessage = 'Nothing to show yet.',
  loading = false,
  pageSize = 25,
  onRowClick,
  actions,
  mobileTitle,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [active, setActive] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Keeps typing responsive on large lists: the input updates immediately while
  // the filtering work runs against the deferred value.
  const deferredSearch = useDeferredValue(search);

  const processed = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();

    let result = rows.filter((row) => {
      for (const filter of filters) {
        const chosen = active[filter.key];
        if (chosen && !filter.matches(row, chosen)) return false;
      }
      if (!needle) return true;
      return columns.some((column) => asSearchText(defaultValue(row, column)).includes(needle));
    });

    if (sort) {
      const column = columns.find((c) => c.key === sort.key);
      if (column) {
        const direction = sort.direction === 'asc' ? 1 : -1;
        result = [...result].sort((a, b) => {
          const av = defaultValue(a, column);
          const bv = defaultValue(b, column);
          // Blanks sort last regardless of direction — an empty cell is not
          // "smallest", it's absent, and burying it keeps the top of the list
          // meaningful.
          const aEmpty = av === null || av === undefined || av === '';
          const bEmpty = bv === null || bv === undefined || bv === '';
          if (aEmpty && bEmpty) return 0;
          if (aEmpty) return 1;
          if (bEmpty) return -1;
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
          return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * direction;
        });
      }
    }

    return result;
  }, [rows, columns, filters, active, deferredSearch, sort]);

  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = processed.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const activeCount = Object.values(active).filter(Boolean).length;

  function toggleSort(column: DataTableColumn<T>) {
    if (column.sortable === false) return;
    setPage(0);
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: 'asc' }
    );
  }

  function setFilter(key: string, value: string) {
    setPage(0);
    setActive((current) => ({ ...current, [key]: value }));
  }

  function clearAll() {
    setPage(0);
    setActive({});
    setSearch('');
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A7D8A] pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full rounded-xl border-2 border-[#D1E0E8] bg-white pl-9 pr-3 py-2.5 text-sm transition-all duration-200 focus:border-[#02465B] focus:outline-none focus:ring-2 focus:ring-[#02465B]/10"
          />
        </div>

        <div className="flex gap-2">
          {filters.length > 0 && (
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-[#D1E0E8] bg-white px-3 py-2.5 text-sm font-medium text-[#02465B] hover:border-[#02465B]/40 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden />
              Filters
              {activeCount > 0 && (
                <span className="rounded-full bg-[#02465B] text-white text-xs px-1.5 py-0.5 leading-none">
                  {activeCount}
                </span>
              )}
            </button>
          )}
          {actions}
        </div>
      </div>

      {filtersOpen && filters.length > 0 && (
        <div className="rounded-xl border border-[#E8EFF3] bg-[#F8FBFC] p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filters.map((filter) => (
            <div key={filter.key} className="space-y-1.5">
              <label
                htmlFor={`filter-${filter.key}`}
                className="text-xs font-medium text-[#5A7D8A] tracking-wide"
              >
                {filter.label}
              </label>
              <select
                id={`filter-${filter.key}`}
                value={active[filter.key] ?? ''}
                onChange={(e) => setFilter(filter.key, e.target.value)}
                className="w-full rounded-xl border-2 border-[#D1E0E8] bg-white px-3 py-2 text-sm focus:border-[#02465B] focus:outline-none"
              >
                <option value="">All</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {(activeCount > 0 || search) && (
            <button
              type="button"
              onClick={clearAll}
              className="self-end inline-flex items-center gap-1.5 text-sm text-[#5A7D8A] hover:text-[#02465B] py-2"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
              Clear all
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-[#5A7D8A]" role="status" aria-live="polite">
        {loading
          ? 'Loading…'
          : `${processed.length} ${processed.length === 1 ? 'result' : 'results'}${
              processed.length !== rows.length ? ` of ${rows.length}` : ''
            }`}
      </p>

      {/* Desktop: real table. Hidden on phones, where it would need horizontal scrolling. */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-[#E8EFF3] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8EFF3] bg-[#F8FBFC]">
              {columns.map((column) => {
                const isSorted = sort?.key === column.key;
                const sortable = column.sortable !== false;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`text-left font-medium text-[#5A7D8A] text-xs tracking-wide px-4 py-3 ${
                      column.align === 'right' ? 'text-right' : ''
                    } ${column.hideOnMobile ? 'hidden lg:table-cell' : ''}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 hover:text-[#02465B] transition-colors"
                      >
                        {column.header}
                        {isSorted ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp className="w-3 h-3" aria-hidden />
                          ) : (
                            <ArrowDown className="w-3 h-3" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-[#5A7D8A]">
                  {loading ? 'Loading…' : emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-[#F1F6F8] last:border-0 ${
                    onRowClick ? 'cursor-pointer hover:bg-[#F8FBFC] transition-colors' : ''
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-[#12333F] ${
                        column.align === 'right' ? 'text-right' : ''
                      } ${column.hideOnMobile ? 'hidden lg:table-cell' : ''} ${column.className ?? ''}`}
                    >
                      {column.render ? column.render(row) : (defaultValue(row, column) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row, so every field stays readable without scrolling sideways. */}
      <div className="sm:hidden space-y-2">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-[#E8EFF3] bg-white px-4 py-10 text-center text-[#5A7D8A]">
            {loading ? 'Loading…' : emptyMessage}
          </div>
        ) : (
          visible.map((row) => (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`rounded-2xl border border-[#E8EFF3] bg-white p-4 ${
                onRowClick ? 'cursor-pointer active:bg-[#F8FBFC]' : ''
              }`}
            >
              <p className="font-medium text-[#12333F] mb-2">
                {mobileTitle
                  ? mobileTitle(row)
                  : columns[0].render
                    ? columns[0].render(row)
                    : (defaultValue(row, columns[0]) ?? '—')}
              </p>
              <dl className="space-y-1.5">
                {columns.slice(1).map((column) => (
                  <div key={column.key} className="flex justify-between gap-3 text-sm">
                    <dt className="text-[#5A7D8A] shrink-0">{column.header}</dt>
                    <dd className="text-[#12333F] text-right min-w-0">
                      {column.render ? column.render(row) : (defaultValue(row, column) ?? '—')}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="inline-flex items-center gap-1 rounded-xl border-2 border-[#D1E0E8] bg-white px-3 py-2 text-sm text-[#02465B] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#02465B]/40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden />
            Previous
          </button>
          <span className="text-xs text-[#5A7D8A]">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="inline-flex items-center gap-1 rounded-xl border-2 border-[#D1E0E8] bg-white px-3 py-2 text-sm text-[#02465B] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#02465B]/40 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
