'use client';

import { ExternalLink, Settings, Copy, Trash2, MoreVertical } from 'lucide-react';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';

interface CardMenuProps {
  /** Absent for a viewer — the menu then only offers to open, read-only. */
  capabilities?: { canManage: boolean; isOwner: boolean };
  onOpen: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

/**
 * The three-dot overflow menu on an assessment card — thin wrapper around
 * the existing DropdownMenu (already used for DataTable's rowActions), not
 * a new pattern. Someone who can manage the assessment gets "Settings" (it's
 * their card, the menu is for configuring it); a viewer gets a plain "Open"
 * since the card itself isn't theirs to change. Duplicate needs edit rights;
 * Delete stays owner-only, same as the detail page's own Delete button.
 */
export function CardMenu({ capabilities, onOpen, onDuplicate, onDelete }: CardMenuProps) {
  const items: DropdownMenuItem[] = capabilities
    ? [{ label: 'Settings', icon: Settings, onClick: onOpen }]
    : [{ label: 'Open', icon: ExternalLink, onClick: onOpen }];

  if (capabilities?.canManage && onDuplicate) {
    items.push({ label: 'Duplicate', icon: Copy, onClick: onDuplicate });
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
