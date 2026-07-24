'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle } from 'lucide-react';

function Confirmation() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-success-bg flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-9 h-9 text-success" />
        </div>
        <h1 className="text-2xl font-bold text-primary-900 mb-2">Assessment submitted</h1>
        <p className="text-sm text-text-muted mb-6">
          Your answers have been recorded successfully. You may now close this page.
        </p>
        <Button variant="primary" className="w-full" onClick={() => router.push('/assessment/list')}>
          Done
        </Button>
      </Card>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center text-text-muted">Loading...</div>}>
      <Confirmation />
    </Suspense>
  );
}
