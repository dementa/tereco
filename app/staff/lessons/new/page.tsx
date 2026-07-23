'use client';

import { useRouter } from 'next/navigation';
import { DailyLessonWizard } from '@/components/staff/DailyLessonWizard';

export default function NewLessonReportPage() {
  const router = useRouter();
  return <DailyLessonWizard onBack={() => router.push('/staff/lessons')} />;
}
