'use client';

import { useParams, useRouter } from 'next/navigation';
import { PracticalScoringGrid } from '@/components/staff/PracticalScoringGrid';

export default function PracticalScoringPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  return (
    <PracticalScoringGrid
      sessionId={params.sessionId}
      onBack={() => router.push('/staff/lessons')}
    />
  );
}
