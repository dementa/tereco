'use client';

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { exportToCsv, exportToExcel, exportToPdf, type ExportCell } from '@/lib/tableExport';

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
  /** Plain value written to exported files. Defaults to `value`. */
  exportValue?: (row: T) => string | number | null | undefined;
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

/**
 * Opt-in "include passwords" export column. Real passwords are never stored
 * anywhere retrievable, so the only honest way to put one in an export is to
 * generate a fresh one right at export time — which is what `fetchPasswords`
 * does. Enabling the checkbox this backs resets the password for every row
 * being exported; there is no way to export a password without doing that.
 */
export interface DataTablePasswordColumn<T> {
  /** Defaults to "Password". */
  label?: string;
  /** Confirmation copy shown before resetting; `count` is the rows about to be exported. */
  confirmMessage?: (count: number) => string;
  /** Resets passwords for the given (already filtered/sorted) rows and resolves rowKey -> new password. */
  fetchPasswords: (rows: T[], onProgress: (done: number, total: number) => void) => Promise<Record<string, string>>;
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
  /**
   * Base name for exported files and the PDF's title. Defaults to "export".
   * Exports cover every filtered/sorted row, not just the current page.
   */
  exportFileName?: string;
  /** Adds an opt-in "include passwords" toggle to the export menu — see DataTablePasswordColumn. */
  passwordColumn?: DataTablePasswordColumn<T>;
}

function defaultValue<T>(row: T, column: DataTableColumn<T>): string | number | null | undefined {
  if (column.value) return column.value(row);
  const candidate = (row as Record<string, unknown>)[column.key];
  return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : undefined;
}

function asSearchText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).toLowerCase();
}

function exportValueFor<T>(row: T, column: DataTableColumn<T>): string | number | null | undefined {
  if (column.exportValue) return column.exportValue(row);
  return defaultValue(row, column);
}

const PAGE_SIZE_OPTIONS = [15, 30, 50];

/**
 * A default max-width constraint, so a long free-text cell ellipsizes instead
 * of forcing the whole row taller — but only when the caller hasn't already
 * asked for a specific width via their own `className`, so an intentionally
 * wide column (e.g. a "Description" column passing `max-w-[420px]`) is left
 * alone rather than double-constrained.
 */
function cellWidthClass(column: { className?: string }): string {
  return column.className?.includes('max-w-') ? '' : 'max-w-[240px]';
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
  pageSize: initialPageSize = 15,
  onRowClick,
  actions,
  mobileTitle,
  exportFileName = 'export',
  passwordColumn,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [active, setActive] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  // Seeded from the `pageSize` prop, but from here on the user's own choice —
  // the selector below (15/30/50) is what actually drives it.
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState('');
  const exportRef = useRef<HTMLDivElement>(null);

  // The blank-header "actions" column is a UI-only affordance, never something
  // worth exporting — everything else starts checked.
  const exportableColumns = useMemo(() => columns.filter((c) => c.header !== ''), [columns]);
  const [selectedCols, setSelectedCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(exportableColumns.map((c) => [c.key, true]))
  );
  const [includePasswords, setIncludePasswords] = useState(false);
  const [passwordProgress, setPasswordProgress] = useState<{ done: number; total: number } | null>(null);

  function toggleColumn(key: string) {
    setSelectedCols((current) => ({ ...current, [key]: !(current[key] ?? true) }));
  }

  function setAllColumns(value: boolean) {
    setSelectedCols(Object.fromEntries(exportableColumns.map((c) => [c.key, value])));
  }

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

  useEffect(() => {
    if (!exportOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [exportOpen]);

  async function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const chosenColumns = exportableColumns.filter((c) => selectedCols[c.key] !== false);
    if (chosenColumns.length === 0 && !(passwordColumn && includePasswords)) {
      setExportError('Select at least one column to export.');
      return;
    }

    // Every filtered/sorted row, not just the current page — a person
    // exporting wants the whole result set they've narrowed down to.
    const exportRows = processed;

    let passwords: Record<string, string> | null = null;
    if (passwordColumn && includePasswords) {
      const count = exportRows.length;
      const message =
        passwordColumn.confirmMessage?.(count) ??
        `This resets the password for ${count} account(s) and generates new ones — their previous password will stop working. Continue?`;
      if (!window.confirm(message)) return;

      setExportOpen(false);
      setExportError('');
      setExporting(format);
      setPasswordProgress({ done: 0, total: count });
      try {
        passwords = await passwordColumn.fetchPasswords(exportRows, (done, total) =>
          setPasswordProgress({ done, total })
        );
      } catch {
        setExportError('Failed to reset passwords — export cancelled.');
        setExporting(null);
        setPasswordProgress(null);
        return;
      }
    } else {
      setExportOpen(false);
      setExportError('');
      setExporting(format);
    }

    try {
      const finalColumns: DataTableColumn<T>[] = passwords
        ? [
            ...chosenColumns,
            {
              key: '__password__',
              header: passwordColumn?.label ?? 'Password',
              value: (row: T) => passwords![rowKey(row)] ?? '',
            },
          ]
        : chosenColumns;
      const headers = finalColumns.map((c) => c.header);
      const exportCells: ExportCell[][] = exportRows.map((row) =>
        finalColumns.map((c) => exportValueFor(row, c) ?? '')
      );
      if (format === 'csv') exportToCsv(exportFileName, headers, exportCells);
      else if (format === 'excel') await exportToExcel(exportFileName, headers, exportCells);
      else await exportToPdf(exportFileName, exportFileName, headers, exportCells);
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(null);
      setPasswordProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#666666] pointer-events-none"
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
            className="w-full rounded-xl border-2 border-[#E5E5E5] bg-white pl-9 pr-3 py-2.5 text-sm transition-all duration-200 focus:border-[#02465B] focus:outline-none focus:ring-2 focus:ring-[#02465B]/10"
          />
        </div>

        <div className="flex gap-2">
          {filters.length > 0 && (
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-[#E5E5E5] bg-white px-3 py-2.5 text-sm font-medium text-[#02465B] hover:border-[#02465B]/40 transition-colors"
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
          {rows.length > 0 && (
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setExportOpen((v) => !v)}
                disabled={exporting !== null}
                aria-expanded={exportOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#E5E5E5] bg-white px-3 py-2.5 text-sm font-medium text-[#02465B] hover:border-[#02465B]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" aria-hidden />
                {exporting
                  ? passwordProgress
                    ? `Resetting passwords… ${passwordProgress.done}/${passwordProgress.total}`
                    : 'Exporting…'
                  : 'Export'}
              </button>
              {exportOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-10 mt-1 w-72 overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-lg"
                >
                  <div className="p-3 border-b border-[#FAFAFA]">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-[#666666] tracking-wide">COLUMNS</p>
                      <div className="flex gap-2 text-xs">
                        <button type="button" onClick={() => setAllColumns(true)} className="text-[#02465B] hover:underline">
                          All
                        </button>
                        <button type="button" onClick={() => setAllColumns(false)} className="text-[#02465B] hover:underline">
                          None
                        </button>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {exportableColumns.map((column) => (
                        <label key={column.key} className="flex items-center gap-2 text-sm text-[#12333F]">
                          <input
                            type="checkbox"
                            checked={selectedCols[column.key] !== false}
                            onChange={() => toggleColumn(column.key)}
                            className="rounded border-[#E5E5E5]"
                          />
                          {column.header}
                        </label>
                      ))}
                    </div>
                    {passwordColumn && (
                      <label className="flex items-start gap-2 text-sm text-[#12333F] mt-3 pt-3 border-t border-[#FAFAFA]">
                        <input
                          type="checkbox"
                          checked={includePasswords}
                          onChange={(e) => setIncludePasswords(e.target.checked)}
                          className="rounded border-[#E5E5E5] mt-0.5"
                        />
                        <span>
                          Include {(passwordColumn.label ?? 'password').toLowerCase()}
                          <span className="block text-xs text-text-muted">
                            Resets it for every exported account — their old password stops working.
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleExport('csv')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#12333F] hover:bg-[#FAFAFA]"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#666666]" aria-hidden /> CSV
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleExport('excel')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#12333F] hover:bg-[#FAFAFA]"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#666666]" aria-hidden /> Excel
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleExport('pdf')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#12333F] hover:bg-[#FAFAFA]"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#666666]" aria-hidden /> PDF
                  </button>
                </div>
              )}
            </div>
          )}
          {actions}
        </div>
      </div>

      {exportError && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-[#C0392B]">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {exportError}
        </p>
      )}

      {filtersOpen && filters.length > 0 && (
        <div className="rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filters.map((filter) => (
            <div key={filter.key} className="space-y-1.5">
              <label
                htmlFor={`filter-${filter.key}`}
                className="text-xs font-medium text-[#666666] tracking-wide"
              >
                {filter.label}
              </label>
              <select
                id={`filter-${filter.key}`}
                value={active[filter.key] ?? ''}
                onChange={(e) => setFilter(filter.key, e.target.value)}
                className="w-full rounded-xl border-2 border-[#E5E5E5] bg-white px-3 py-2 text-sm focus:border-[#02465B] focus:outline-none"
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
              className="self-end inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#02465B] py-2"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
              Clear all
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-[#666666]" role="status" aria-live="polite">
        {loading
          ? 'Loading…'
          : `${processed.length} ${processed.length === 1 ? 'result' : 'results'}${
              processed.length !== rows.length ? ` of ${rows.length}` : ''
            }`}
      </p>

      {/* Desktop: real table. Hidden on phones, where it would need horizontal scrolling. */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-[#EAEAEA] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EAEAEA] bg-[#FAFAFA]">
              {columns.map((column) => {
                const isSorted = sort?.key === column.key;
                const sortable = column.sortable !== false;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`text-left font-medium text-[#666666] text-xs tracking-wide px-4 py-3 ${
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
                <td colSpan={columns.length} className="px-4 py-10 text-center text-[#666666]">
                  {loading ? 'Loading…' : emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-[#FAFAFA] last:border-0 ${
                    onRowClick ? 'cursor-pointer hover:bg-[#FAFAFA] transition-colors' : ''
                  }`}
                >
                  {columns.map((column) => {
                    const rawValue = defaultValue(row, column);
                    return (
                      <td
                        key={column.key}
                        className={`px-4 py-3 text-[#12333F] ${
                          column.align === 'right' ? 'text-right' : ''
                        } ${column.hideOnMobile ? 'hidden lg:table-cell' : ''} ${column.className ?? ''}`}
                      >
                        {column.render ? (
                          <div className={`truncate ${cellWidthClass(column)}`}>{column.render(row)}</div>
                        ) : (
                          <span className={`block truncate ${cellWidthClass(column)}`} title={asSearchText(rawValue) ? String(rawValue) : undefined}>
                            {rawValue ?? '—'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row, so every field stays readable without scrolling sideways. */}
      <div className="sm:hidden space-y-2">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-[#EAEAEA] bg-white px-4 py-10 text-center text-[#666666]">
            {loading ? 'Loading…' : emptyMessage}
          </div>
        ) : (
          visible.map((row) => (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`rounded-2xl border border-[#EAEAEA] bg-white p-4 ${
                onRowClick ? 'cursor-pointer active:bg-[#FAFAFA]' : ''
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
                {columns.slice(1).map((column) => {
                  const rawValue = defaultValue(row, column);
                  return (
                    <div key={column.key} className="flex justify-between gap-3 text-sm">
                      <dt className="text-[#666666] shrink-0">{column.header}</dt>
                      <dd
                        className="text-[#12333F] text-right min-w-0 truncate"
                        title={!column.render && asSearchText(rawValue) ? String(rawValue) : undefined}
                      >
                        {column.render ? column.render(row) : (rawValue ?? '—')}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))
        )}
      </div>

      {processed.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-[#666666]">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="rounded-lg border-2 border-[#E5E5E5] bg-white px-2 py-1 text-xs text-[#02465B] focus:border-[#02465B] focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          {pageCount > 1 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#02465B] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#02465B]/40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
                Previous
              </button>
              <span className="text-xs text-[#666666] whitespace-nowrap">
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#02465B] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#02465B]/40 transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
