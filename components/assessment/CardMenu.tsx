'use client';

import { ExternalLink, Copy, Trash2 } from 'lucide-react';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';

interface CardMenuProps {
  capabilities: { canManage: boolean; isOwner: boolean };
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * The three-dot overflow menu on an assessment card — thin wrapper around
 * the existing DropdownMenu (already used for DataTable's rowActions), not
 * a new pattern. Duplicate needs edit rights; Delete stays owner-only, same
 * as the detail page's own Delete button.
 */
export function CardMenu({ capabilities, onOpen, onDuplicate, onDelete }: CardMenuProps) {
  const items: DropdownMenuItem[] = [
    { label: 'Open', icon: ExternalLink, onClick: onOpen },
  ];
  if (capabilities.canManage) {
    items.push({ label: 'Duplicate', icon: Copy, onClick: onDuplicate });
  }
  if (capabilities.isOwner) {
    items.push({ label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onClick: onDelete });
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu items={items} label="Assessment actions" />
    </div>
  );
}
