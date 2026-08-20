'use client';

import { useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import type { SegmentEntry } from '@/lib/entities/assessment-analytics';

interface SegmentDrillDownModalProps {
  open: boolean;
  onClose: () => void;
  /** e.g. "Missed", "Score 60-69%", "Q3 — What is a computer?" */
  title: string;
  loading: boolean;
  entries: SegmentEntry[];
  /** Header for the value column — omitted (and the column hidden) when the segment carries no per-student value, e.g. "missed". */
  valueHeader?: string;
}

/**
 * The generic drill-down table behind every clickable chart segment — same
 * shape (name, class, system ID, an optional value column) regardless of
 * which chart or bar was clicked, per the product decision to keep one
 * reusable pattern rather than a bespoke table per chart.
 */
export function SegmentDrillDownModal({
  open,
  onClose,
  title,
  loading,
  entries,
  valueHeader,
}: SegmentDrillDownModalProps) {
  const columns: DataTableColumn<SegmentEntry>[] = useMemo(() => {
    const base: DataTableColumn<SegmentEntry>[] = [
      { key: 'studentName', header: 'Student', value: (r) => r.studentName },
      { key: 'studentSystemId', header: 'Student ID', value: (r) => r.studentSystemId ?? '—' },
      { key: 'className', header: 'Class', value: (r) => r.className || '—' },
    ];
    if (valueHeader) {
      base.push({ key: 'value', header: valueHeader, value: (r) => r.value ?? '—' });
    }
    return base;
  }, [valueHeader]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <DataTable
          rows={entries}
          columns={columns}
          rowKey={(r) => r.studentId}
          initialSort={{ key: 'studentName', direction: 'asc' }}
          searchPlaceholder="Search by name, ID or class…"
          emptyMessage="Nobody in this segment."
          mobileTitle={(r) => r.studentName}
          exportFileName="segment"
        />
      )}
    </Modal>
  );
}
