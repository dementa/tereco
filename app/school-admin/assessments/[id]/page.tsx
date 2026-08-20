'use client';

import { useParams } from 'next/navigation';
import { AssessmentAnalytics } from '@/components/assessment/AssessmentAnalytics';

export default function SchoolAdminAssessmentDetailPage() {
  const params = useParams<{ id: string }>();
  return <AssessmentAnalytics systemId={params.id} role="school_admin" apiBase="/api/school-admin/assessments" />;
}
