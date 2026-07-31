'use client';

import { VideoViewer } from '@/components/library/viewers/VideoViewer';
import { AudioViewer } from '@/components/library/viewers/AudioViewer';
import { DocumentViewer } from '@/components/library/viewers/DocumentViewer';

export interface ViewableLibraryItem {
  title: string;
  contentType: 'video' | 'document' | 'notes' | 'support_file' | 'audiobook' | 'past_paper' | 'presentation';
  fileFormat: string | null;
  streamUrl: string;
}

/** Dispatches to the right in-app viewer by content type — shared by the browse detail view and the super-admin approval queue's preview. */
export function LibraryItemViewer({ item }: { item: ViewableLibraryItem }) {
  if (item.contentType === 'video') return <VideoViewer src={item.streamUrl} />;
  if (item.contentType === 'audiobook') return <AudioViewer src={item.streamUrl} title={item.title} />;
  return <DocumentViewer src={item.streamUrl} format={item.fileFormat ?? ''} />;
}
