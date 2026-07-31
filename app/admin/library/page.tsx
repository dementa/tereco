'use client';

import { MyLibraryUploads } from '@/components/library/MyLibraryUploads';

export default function AdminLibraryPage() {
  return <MyLibraryUploads newHref="/admin/library/new" />;
}
