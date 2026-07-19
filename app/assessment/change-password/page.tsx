'use client';

import { useRouter } from 'next/navigation';
import { ChangePasswordScreen } from '@/components/auth/ChangePasswordScreen';
import { useAuth } from '@/components/auth/AuthContext';

export default function AssessmentChangePasswordPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const handleDone = async () => {
    await refresh(); // clears mustChangePassword in context
    router.push('/assessment/list');
  };

  return <ChangePasswordScreen onDone={handleDone} />;
}
