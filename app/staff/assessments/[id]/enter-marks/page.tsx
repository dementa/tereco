'use client';

import { useParams } from 'next/navigation';
import { EnterMarksPanel } from '@/components/assessment/EnterMarksPanel';

export default function StaffEnterMarksPage() {
  const params = useParams<{ id: string }>();
  return <EnterMarksPanel assessmentSystemId={params.id} backHref={`/staff/assessments/${params.id}`} />;
}
