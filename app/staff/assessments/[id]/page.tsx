'use client';

import { useParams } from 'next/navigation';
import { AssessmentAnalytics } from '@/components/assessment/AssessmentAnalytics';

export default function StaffAssessmentDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <AssessmentAnalytics
      systemId={params.id}
      role="staff"
      apiBase="/api/admin/assessments"
      markingHref="/staff/marking"
    />
  );
}
