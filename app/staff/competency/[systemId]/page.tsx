'use client';

import { useParams } from 'next/navigation';
import { CompetencyExamPanel } from '@/components/staff/CompetencyExamPanel';

export default function CompetencyExamScoringPage() {
  const params = useParams<{ systemId: string }>();
  return <CompetencyExamPanel systemId={params.systemId} />;
}
