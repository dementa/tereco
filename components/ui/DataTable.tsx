'use client';

import React, { useDeferredValue, useMemo, useState } from 'react';
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
  MoreHorizontal,
  Search,
  X,
} from 'lucide-react';
import { exportToCsv, exportToExcel, exportToPdf, type ExportCell } from '@/lib/tableExport';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { Modal } from '@/components/ui/Modal';

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
  /**
   * Overrides `exportValue` for the PDF export specifically — CSV and Excel
   * keep using `exportValue`/`value` unchanged. For a column whose printed
   * form should differ from its data form (e.g. a percentage rounded to a
   * whole number on the printed page, kept at full precision in CSV/Excel).
   */
  pdfValue?: (row: T) => string | number | null | undefined;
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
  /**
   * The page's primary call to action, rendered as a real button at the end of
   * the toolbar. Keep this to one button — everything else belongs in
   * `secondaryActions`, or the toolbar wraps onto a second line.
   */
  actions?: React.ReactNode;
  /**
   * Secondary page actions (Import, bulk operations, …). These are folded into
   * the toolbar's "⋯" menu alongside Export, so the number of them never
   * changes the toolbar's height.
   */
  secondaryActions?: DropdownMenuItem[];
  /**
   * Per-row overflow menu. When given, a right-aligned "⋯" column is appended
   * automatically — the modern replacement for a strip of icon buttons. The
   * menu never triggers `onRowClick`.
   */
  rowActions?: (row: T) => DropdownMenuItem[];
  /** Headline for each card in the mobile layout. Defaults to the first column. */
  mobileTitle?: (row: T) => React.ReactNode;
  /**
   * Base name for exported files and the PDF's title. Defaults to "export".
   * Exports cover every filtered/sorted row, not just the current page.
   */
  exportFileName?: string;
  /** Adds an opt-in "include passwords" toggle to the export menu — see DataTablePasswordColumn. */
  passwordColumn?: DataTablePasswordColumn<T>;
  /**
   * Adds a leading "No." column, on screen and in every export format — a
   * plain 1-based row position in the filtered/sorted set (continuing across
   * pages, not resetting per page), distinct from any caller-defined ranking
   * column. Not part of `columns`, so it can't be hidden via the export
   * column picker — a row's position in its own export is not optional.
   */
  numbered?: boolean;
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
  secondaryActions = [],
  rowActions,
  mobileTitle,
  exportFileName = 'export',
  passwordColumn,
  numbered = false,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [active, setActive] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  // Seeded from the `pageSize` prop, but from here on the user's own choice —
  // the selector below (15/30/50) is what actually drives it.
  const [pageSize, setPageSize] = useState(initialPageSize);
  // The export UI is a dialog rather than a popover: it carries a column
  // picker, a password opt-in and three format choices, which is more than a
  // menu-sized surface can hold without becoming a nested-popover puzzle.
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState('');

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

  // Export lives here rather than as its own toolbar button — one "⋯" is the
  // whole overflow story, so adding a page action can never push the toolbar
  // onto a second line again.
  const overflowItems: DropdownMenuItem[] = [
    ...secondaryActions,
    ...(rows.length > 0
      ? [
          {
            label: exporting ? 'Exporting…' : 'Export…',
            icon: Download,
            disabled: exporting !== null,
            separatorBefore: secondaryActions.length > 0,
            onClick: () => {
              setExportError('');
              setExportOpen(true);
            },
          },
        ]
      : []),
  ];

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
      const headers = [...(numbered ? ['No.'] : []), ...finalColumns.map((c) => c.header)];
      const exportCells: ExportCell[][] = exportRows.map((row, i) => [
        ...(numbered ? [i + 1] : []),
        ...finalColumns.map((c) => (format === 'pdf' && c.pdfValue ? c.pdfValue(row) : exportValueFor(row, c)) ?? ''),
      ]);
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
      {/*
        One toolbar row on desktop, and it stays one row no matter how many
        filters or page actions a caller passes: the filter strip is the only
        thing allowed to scroll, the action cluster is `shrink-0`, and
        everything beyond the single primary button lives behind the "⋯".
      */}
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1 min-w-0 md:max-w-md">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
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
            className="w-full h-9 rounded-lg border border-border-strong bg-bg-card pl-9 pr-3 text-sm transition-colors focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/15"
          />
        </div>

        {filters.length > 0 && (
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filters.map((filter) => {
              const value = active[filter.key] ?? '';
              return (
                <select
                  key={filter.key}
                  aria-label={filter.label}
                  value={value}
                  onChange={(e) => setFilter(filter.key, e.target.value)}
                  className={`h-9 shrink-0 rounded-lg border border-border-strong bg-bg-card px-2.5 text-sm transition-colors focus:border-primary-700 focus:outline-none ${
                    value ? 'text-text-primary font-medium' : 'text-text-muted'
                  }`}
                >
                  <option value="">All {filter.label.toLowerCase()}</option>
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0 md:ml-auto">
          {(activeCount > 0 || search) && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-text-muted hover:bg-bg-muted hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" aria-hidden /> Clear
            </button>
          )}
          {actions}
          {overflowItems.length > 0 && (
            <DropdownMenu
              items={overflowItems}
              label="More actions"
              triggerClassName="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-bg-card text-text-muted transition-colors hover:bg-bg-subtle hover:text-text-primary"
            />
          )}
        </div>
      </div>

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Export">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-text-muted tracking-wide">COLUMNS</p>
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => setAllColumns(true)} className="text-primary-700 hover:underline">
                  All
                </button>
                <button type="button" onClick={() => setAllColumns(false)} className="text-primary-700 hover:underline">
                  None
                </button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pr-1">
              {exportableColumns.map((column) => (
                <label key={column.key} className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={selectedCols[column.key] !== false}
                    onChange={() => toggleColumn(column.key)}
                    className="rounded border-border-strong"
                  />
                  {column.header}
                </label>
              ))}
            </div>
          </div>

          {passwordColumn && (
            <label className="flex items-start gap-2 text-sm text-text-secondary pt-3 border-t border-border">
              <input
                type="checkbox"
                checked={includePasswords}
                onChange={(e) => setIncludePasswords(e.target.checked)}
                className="rounded border-border-strong mt-0.5"
              />
              <span>
                Include {(passwordColumn.label ?? 'password').toLowerCase()}
                <span className="block text-xs text-text-muted">
                  Resets it for every exported account — their old password stops working.
                </span>
              </span>
            </label>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => void handleExport('csv')}
              className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-border-strong bg-bg-card text-sm font-medium text-text-primary hover:bg-bg-subtle transition-colors"
            >
              <FileText className="w-4 h-4 text-text-muted" aria-hidden /> CSV
            </button>
            <button
              type="button"
              onClick={() => void handleExport('excel')}
              className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-border-strong bg-bg-card text-sm font-medium text-text-primary hover:bg-bg-subtle transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-text-muted" aria-hidden /> Excel
            </button>
            <button
              type="button"
              onClick={() => void handleExport('pdf')}
              className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-border-strong bg-bg-card text-sm font-medium text-text-primary hover:bg-bg-subtle transition-colors"
            >
              <FileText className="w-4 h-4 text-text-muted" aria-hidden /> PDF
            </button>
          </div>

          <p className="text-xs text-text-muted">
            Exports all {processed.length} filtered {processed.length === 1 ? 'row' : 'rows'}, not just this page.
          </p>
        </div>
      </Modal>

      {exporting && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted" role="status" aria-live="polite">
          <MoreHorizontal className="w-3.5 h-3.5 animate-pulse" aria-hidden />
          {passwordProgress
            ? `Resetting passwords… ${passwordProgress.done}/${passwordProgress.total}`
            : 'Preparing export…'}
        </p>
      )}

      {exportError && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-error">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden /> {exportError}
        </p>
      )}

      <p className="text-xs text-text-muted" role="status" aria-live="polite">
        {loading
          ? 'Loading…'
          : `${processed.length} ${processed.length === 1 ? 'result' : 'results'}${
              processed.length !== rows.length ? ` of ${rows.length}` : ''
            }`}
      </p>

      {/* Desktop: real table. Hidden on phones, where it would need horizontal scrolling. */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle">
              {numbered && (
                <th scope="col" className="text-left font-medium text-text-muted text-xs tracking-wide px-3 h-9 w-12">
                  No.
                </th>
              )}
              {columns.map((column) => {
                const isSorted = sort?.key === column.key;
                const sortable = column.sortable !== false;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`text-left font-medium text-text-muted text-xs tracking-wide px-3 h-9 ${
                      column.align === 'right' ? 'text-right' : ''
                    } ${column.hideOnMobile ? 'hidden lg:table-cell' : ''}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 hover:text-text-primary transition-colors"
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
              {rowActions && <th scope="col" className="w-12 px-3 h-9" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (numbered ? 1 : 0) + (rowActions ? 1 : 0)}
                  className="px-3 py-10 text-center text-text-muted"
                >
                  {loading ? 'Loading…' : emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-border last:border-0 ${
                    onRowClick ? 'cursor-pointer hover:bg-bg-subtle transition-colors' : ''
                  }`}
                >
                  {numbered && (
                    <td className="px-3 py-2 text-text-secondary tabular-nums">{safePage * pageSize + i + 1}</td>
                  )}
                  {columns.map((column) => {
                    const rawValue = defaultValue(row, column);
                    return (
                      <td
                        key={column.key}
                        className={`px-3 py-2 text-text-secondary ${
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
                  {rowActions && (
                    <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu items={rowActions(row)} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row, so every field stays readable without scrolling sideways. */}
      <div className="sm:hidden space-y-2">
        {visible.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-card px-4 py-10 text-center text-text-muted">
            {loading ? 'Loading…' : emptyMessage}
          </div>
        ) : (
          visible.map((row) => (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`rounded-lg border border-border bg-bg-card p-3 ${
                onRowClick ? 'cursor-pointer active:bg-bg-subtle' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-medium text-text-primary min-w-0 break-words">
                  {mobileTitle
                    ? mobileTitle(row)
                    : columns[0].render
                      ? columns[0].render(row)
                      : (defaultValue(row, columns[0]) ?? '—')}
                </p>
                {rowActions && (
                  <div className="shrink-0 -mr-1 -mt-1" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu items={rowActions(row)} />
                  </div>
                )}
              </div>
              {/*
                A label/value grid rather than `justify-between` rows. The old
                layout pinned the label at its natural width and gave the value
                whatever was left, then truncated it — so on a 360px screen a
                long value ("Ebenezer Standard Junior Schools") was clipped to a
                few characters and the card was all labels. Here the label column
                is sized once from the widest label, and values wrap instead of
                truncating, so nothing is hidden.
              */}
              <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                {columns.slice(1).map((column) => {
                  const rawValue = defaultValue(row, column);
                  return (
                    <React.Fragment key={column.key}>
                      <dt className="text-text-muted">{column.header}</dt>
                      <dd className="text-text-secondary text-right break-words min-w-0">
                        {column.render ? column.render(row) : (rawValue ?? '—')}
                      </dd>
                    </React.Fragment>
                  );
                })}
              </dl>
            </div>
          ))
        )}
      </div>

      {processed.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="h-7 rounded-md border border-border-strong bg-bg-card px-2 text-xs text-text-primary focus:border-primary-700 focus:outline-none"
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
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong bg-bg-card px-2.5 text-sm text-text-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-bg-subtle transition-colors"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
                Previous
              </button>
              <span className="text-xs text-text-muted whitespace-nowrap">
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong bg-bg-card px-2.5 text-sm text-text-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-bg-subtle transition-colors"
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
