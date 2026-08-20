'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CardMenu } from '@/components/assessment/CardMenu';

export interface CardAssessment {
  id: string;
  systemId: string;
  title: string;
  status: 'draft' | 'published' | 'closed';
  targets: { schoolId: string | null; level: number | null }[];
  opensAt?: string;
  closesAt?: string;
  resultsReleasedAt?: string;
  /** Set once a super_admin hides this assessment. Only a super_admin ever receives it in a list at all. */
  hiddenAt?: string;
  /** Whether marks from this assessment count toward the blended performance figure. Defaults true — absent/true both read as included. */
  includeInEvaluation?: boolean;
  /** Absent for school_admin's read-only list — card menu falls back to a plain "Open". */
  capabilities?: { canManage: boolean; isOwner: boolean; canHide: boolean; canToggleEvaluation?: boolean };
}

export const STATUS_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'muted'> = {
  draft: 'muted',
  published: 'success',
  closed: 'default',
};

export function formatWindow(a: { opensAt?: string; closesAt?: string }): string {
  if (!a.opensAt && !a.closesAt) return 'Always open';
  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  return `${fmt(a.opensAt)} → ${fmt(a.closesAt)}`;
}

/**
 * Names the single target when there's exactly one (the common case, and
 * worth being specific about), otherwise falls back to a count. `schools`/
 * `levels` may be empty — school_admin has no directory to resolve names
 * against, since it only ever sees assessments already scoped to its own
 * school, so a school-only target there just reads as "This school" rather
 * than failing to render.
 */
export function describeAudience(
  targets: CardAssessment['targets'],
  schools: { id: string; name: string }[],
  levels: { level: number; code: string }[]
): string {
  if (targets.length === 0) return 'All students';
  if (targets.length === 1) {
    const t = targets[0];
    const parts = [
      t.schoolId ? (schools.find((s) => s.id === t.schoolId)?.name ?? 'This school') : null,
      t.level !== null ? (levels.find((l) => l.level === t.level)?.code ?? `Level ${t.level}`) : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' · ');
  }
  return `${targets.length} target${targets.length === 1 ? '' : 's'}`;
}

interface AssessmentCardProps {
  assessment: CardAssessment;
  schools?: { id: string; name: string }[];
  levels?: { level: number; code: string }[];
  onClick: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleHidden?: () => void;
  onToggleEvaluation?: () => void;
}

export function AssessmentCard({
  assessment,
  schools = [],
  levels = [],
  onClick,
  onDuplicate,
  onDelete,
  onToggleHidden,
  onToggleEvaluation,
}: AssessmentCardProps) {
  // Card itself doesn't forward onClick, so the click/keyboard target wraps
  // it rather than trying to thread the handler through.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer text-left"
    >
      <Card hover>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-primary-900 min-w-0 truncate">{assessment.title}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant={STATUS_VARIANT[assessment.status]}>{assessment.status}</Badge>
            <CardMenu
              capabilities={assessment.capabilities}
              hidden={Boolean(assessment.hiddenAt)}
              excludedFromEvaluation={assessment.includeInEvaluation === false}
              onOpen={onClick}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onToggleHidden={onToggleHidden}
              onToggleEvaluation={onToggleEvaluation}
            />
          </div>
        </div>
        <p className="text-xs text-text-muted mb-3">{assessment.systemId}</p>
        <div className="space-y-1 text-xs text-[#666666]">
          <p>{describeAudience(assessment.targets, schools, levels)}</p>
          <p>{formatWindow(assessment)}</p>
          <div className="flex flex-wrap gap-1">
            {assessment.resultsReleasedAt && <Badge variant="success">Results released</Badge>}
            {assessment.hiddenAt && <Badge variant="muted">Hidden</Badge>}
            {assessment.includeInEvaluation === false && <Badge variant="muted">Not evaluated</Badge>}
          </div>
        </div>
      </Card>
    </div>
  );
}
