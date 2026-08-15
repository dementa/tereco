'use client';

import { LibraryBrowse } from '@/components/library/LibraryBrowse';

// Browse only — uploading, editing, deleting, or submitting library content
// is staff/admin/super_admin, not school_admin (see /api/library/content and
// /api/library/uploads/*). Unlike LibraryPortal (used by staff/admin), there
// is no "My uploads" tab or "New" link here.
export default function SchoolAdminLibraryPage() {
  return <LibraryBrowse />;
}
