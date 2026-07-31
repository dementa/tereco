'use client';

import { LibraryUploadForm } from '@/components/library/LibraryUploadForm';

export default function NewAdminLibraryUploadPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-900 mb-6">Upload to the Library</h1>
      <LibraryUploadForm myUploadsHref="/admin/library" />
    </div>
  );
}
