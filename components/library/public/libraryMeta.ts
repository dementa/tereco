import { FileText, Headphones, LayoutGrid, NotebookPen, PlayCircle, Presentation, FolderOpen, ScrollText } from 'lucide-react';
import type { LibraryContentTypeValue } from '@/components/library/LibraryThumbnail';

/** How each kind of item is named and opened on the public Library. */
export const TYPE_META: Record<
  LibraryContentTypeValue,
  { label: string; icon: React.ElementType; action: string }
> = {
  video: { label: 'Video', icon: PlayCircle, action: 'Watch now' },
  document: { label: 'Document', icon: FileText, action: 'Read now' },
  notes: { label: 'Notes', icon: NotebookPen, action: 'Read now' },
  support_file: { label: 'Resource', icon: FolderOpen, action: 'Open' },
  audiobook: { label: 'Audiobook', icon: Headphones, action: 'Listen now' },
  past_paper: { label: 'Past paper', icon: ScrollText, action: 'Open paper' },
  presentation: { label: 'Slides', icon: Presentation, action: 'View slides' },
};

/** The browse categories, in the order the shelf shows them. */
export const CATEGORIES: { key: string; label: string; icon: React.ElementType; types: LibraryContentTypeValue[] }[] = [
  { key: 'all', label: 'All', icon: LayoutGrid, types: [] },
  { key: 'notes', label: 'Notes', icon: NotebookPen, types: ['document', 'notes'] },
  { key: 'videos', label: 'Videos', icon: PlayCircle, types: ['video'] },
  { key: 'past-papers', label: 'Past papers', icon: ScrollText, types: ['past_paper'] },
  { key: 'slides', label: 'Slides', icon: Presentation, types: ['presentation'] },
  { key: 'audio', label: 'Audiobooks', icon: Headphones, types: ['audiobook'] },
  { key: 'resources', label: 'Resources', icon: FolderOpen, types: ['support_file'] },
];

export function inCategory(contentType: LibraryContentTypeValue, key: string): boolean {
  const category = CATEGORIES.find((c) => c.key === key);
  return !category || category.types.length === 0 || category.types.includes(contentType);
}

/** "12 pages", "PDF", "MP4" — the one fact a card can show without opening the item. */
export function sizeLabel(item: { pageImageUrls?: string[] | null; fileFormat: string | null }): string | null {
  if (item.pageImageUrls && item.pageImageUrls.length > 0) {
    const n = item.pageImageUrls.length;
    return `${n} page${n === 1 ? '' : 's'}`;
  }
  return item.fileFormat ? item.fileFormat.toUpperCase() : null;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
