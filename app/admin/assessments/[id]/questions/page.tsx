'use client';

import { useParams } from 'next/navigation';
import { QuestionsEditor } from '@/components/assessment/QuestionsEditor';

export default function AdminQuestionsPage() {
  const params = useParams<{ id: string }>();
  return (
    <QuestionsEditor systemId={params.id} apiBase="/api/admin/assessments" detailHref="/admin/assessments" />
  );
}
