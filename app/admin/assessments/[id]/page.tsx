'use client';

import { useParams } from 'next/navigation';
import { AssessmentAnalytics } from '@/components/assessment/AssessmentAnalytics';

export default function AdminAssessmentDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <AssessmentAnalytics
      systemId={params.id}
      role="admin"
      apiBase="/api/admin/assessments"
      markingHref="/admin/marking"
    />
  );
}
