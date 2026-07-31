'use client';

import { useState } from 'react';
import { LibraryBrowse } from '@/components/library/LibraryBrowse';
import { MyLibraryUploads } from '@/components/library/MyLibraryUploads';

export default function StaffLibraryPage() {
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('browse')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'browse' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-primary-50'}`}
        >
          Browse
        </button>
        <button
          onClick={() => setTab('mine')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'mine' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-primary-50'}`}
        >
          My uploads
        </button>
      </div>
      {tab === 'browse' ? <LibraryBrowse /> : <MyLibraryUploads newHref="/staff/library/new" />}
    </div>
  );
}
