'use client';

import {
  STATUS_VARIANT,
  describeAudience,
  formatWindow,
  type CardAssessment,
} from '@/components/assessment/AssessmentCard';
import { Badge } from '@/components/ui/Badge';
import { CardMenu } from '@/components/assessment/CardMenu';

interface AssessmentTableProps {
  assessments: CardAssessment[];
  schools?: { id: string; name: string }[];
  levels?: { level: number; code: string }[];
  onRowClick: (a: CardAssessment) => void;
  onDuplicate?: (a: CardAssessment) => void;
  onDelete?: (a: CardAssessment) => void;
  onToggleHidden?: (a: CardAssessment) => void;
  onToggleEvaluation?: (a: CardAssessment) => void;
  emptyMessage?: string;
}

/**
 * Row-per-assessment alternative to the card grid — same data, same
 * CardMenu (Settings/Duplicate/Delete for managers, plain Open for a
 * viewer), just laid out as Supabase's table view does its project list.
 */
export function AssessmentTable({
  assessments,
  schools = [],
  levels = [],
  onRowClick,
  onDuplicate,
  onDelete,
  onToggleHidden,
  onToggleEvaluation,
  emptyMessage = 'No assessments yet.',
}: AssessmentTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-subtle">
            <th scope="col" className="text-left font-medium text-text-muted text-xs tracking-wide px-3 h-9">
              Title
            </th>
            <th scope="col" className="text-left font-medium text-text-muted text-xs tracking-wide px-3 h-9">
              Status
            </th>
            <th
              scope="col"
              className="text-left font-medium text-text-muted text-xs tracking-wide px-3 h-9 hidden lg:table-cell"
            >
              Audience
            </th>
            <th
              scope="col"
              className="text-left font-medium text-text-muted text-xs tracking-wide px-3 h-9 hidden lg:table-cell"
            >
              Window
            </th>
            <th scope="col" className="w-12 px-3 h-9" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {assessments.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-10 text-center text-text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            assessments.map((a) => (
              <tr
                key={a.id}
                onClick={() => onRowClick(a)}
                className="border-b border-border last:border-0 cursor-pointer hover:bg-bg-subtle transition-colors"
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium text-text-primary truncate max-w-[280px]">{a.title}</div>
                  <div className="text-xs text-text-muted">{a.systemId}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>
                    {a.resultsReleasedAt && <Badge variant="success">Results released</Badge>}
                    {a.hiddenAt && <Badge variant="muted">Hidden</Badge>}
                    {a.includeInEvaluation === false && <Badge variant="muted">Not evaluated</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-text-secondary hidden lg:table-cell">
                  <span className="block truncate max-w-[220px]">{describeAudience(a.targets, schools, levels)}</span>
                </td>
                <td className="px-3 py-2.5 text-text-secondary hidden lg:table-cell">
                  <span className="block truncate max-w-[280px]">{formatWindow(a)}</span>
                </td>
                <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <CardMenu
                    capabilities={a.capabilities}
                    hidden={Boolean(a.hiddenAt)}
                    excludedFromEvaluation={a.includeInEvaluation === false}
                    onOpen={() => onRowClick(a)}
                    onDuplicate={onDuplicate ? () => onDuplicate(a) : undefined}
                    onDelete={onDelete ? () => onDelete(a) : undefined}
                    onToggleHidden={onToggleHidden ? () => onToggleHidden(a) : undefined}
                    onToggleEvaluation={onToggleEvaluation ? () => onToggleEvaluation(a) : undefined}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
