'use client';

import { useState } from 'react';
import { LibraryBrowse } from '@/components/library/LibraryBrowse';
import { MyLibraryUploads } from '@/components/library/MyLibraryUploads';

/**
 * The staff/admin/school-admin library screen: a "Browse" tab (everything the
 * viewer's role and scope may see — resolved server-side by
 * library_content_for_profile) alongside their own "My uploads". Students and
 * parents get LibraryBrowse directly; they don't upload.
 */
export function LibraryPortal({ newHref }: { newHref: string }) {
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('browse')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'browse' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'}`}
        >
          Browse
        </button>
        <button
          onClick={() => setTab('mine')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'mine' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'}`}
        >
          My uploads
        </button>
      </div>
      {tab === 'browse' ? <LibraryBrowse /> : <MyLibraryUploads newHref={newHref} />}
    </div>
  );
}
