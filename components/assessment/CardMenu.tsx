'use client';

import { ExternalLink, Settings, Copy, Eye, EyeOff, ListChecks, ListX, Trash2, MoreVertical } from 'lucide-react';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';

interface CardMenuProps {
  /** Absent for a viewer — the menu then only offers to open, read-only. */
  capabilities?: { canManage: boolean; isOwner: boolean; canHide?: boolean; canToggleEvaluation?: boolean };
  /** Whether this assessment is currently super_admin-hidden. Only meaningful alongside canHide. */
  hidden?: boolean;
  /** Whether this assessment is currently excluded from the evaluation. Only meaningful alongside canToggleEvaluation. */
  excludedFromEvaluation?: boolean;
  onOpen: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleHidden?: () => void;
  onToggleEvaluation?: () => void;
}

/**
 * The three-dot overflow menu on an assessment card — thin wrapper around
 * the existing DropdownMenu (already used for DataTable's rowActions), not
 * a new pattern. Someone who can manage the assessment gets "Settings" (it's
 * their card, the menu is for configuring it); a viewer gets a plain "Open"
 * since the card itself isn't theirs to change. Duplicate needs edit rights;
 * Hide/Unhide and Include/Exclude from evaluation are both strictly
 * super_admin (canHide/canToggleEvaluation), unrelated to ownership; Delete
 * stays owner-only, same as the detail page's own Delete button.
 */
export function CardMenu({
  capabilities,
  hidden = false,
  excludedFromEvaluation = false,
  onOpen,
  onDuplicate,
  onDelete,
  onToggleHidden,
  onToggleEvaluation,
}: CardMenuProps) {
  const items: DropdownMenuItem[] = capabilities
    ? [{ label: 'Settings', icon: Settings, onClick: onOpen }]
    : [{ label: 'Open', icon: ExternalLink, onClick: onOpen }];

  if (capabilities?.canManage && onDuplicate) {
    items.push({ label: 'Duplicate', icon: Copy, onClick: onDuplicate });
  }
  if (capabilities?.canHide && onToggleHidden) {
    items.push(
      hidden
        ? { label: 'Unhide', icon: Eye, separatorBefore: true, onClick: onToggleHidden }
        : { label: 'Hide', icon: EyeOff, separatorBefore: true, onClick: onToggleHidden }
    );
  }
  if (capabilities?.canToggleEvaluation && onToggleEvaluation) {
    items.push(
      excludedFromEvaluation
        ? { label: 'Include in evaluation', icon: ListChecks, separatorBefore: !capabilities?.canHide, onClick: onToggleEvaluation }
        : { label: 'Exclude from evaluation', icon: ListX, separatorBefore: !capabilities?.canHide, onClick: onToggleEvaluation }
    );
  }
  if (capabilities?.isOwner && onDelete) {
    items.push({ label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onClick: onDelete });
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu items={items} label="Assessment actions" icon={MoreVertical} />
    </div>
  );
}
