'use client';

import { useRouter } from 'next/navigation';
import { ChangePasswordScreen } from '@/components/auth/ChangePasswordScreen';
import { useAuth } from '@/components/auth/AuthContext';
import { SKIP_PASSWORD_CHANGE_KEY } from '@/components/assessment/AssessmentList';

export default function AssessmentChangePasswordPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const handleDone = async () => {
    await refresh(); // clears mustChangePassword in context
    router.push('/assessment/list');
  };

  // Skippable on purpose. A learner arriving to sit a timed paper must be able
  // to get to it; the password change can happen whenever suits them.
  //
  // sessionStorage rather than a query param: the list redirects here whenever
  // the flag is set, so the "I chose to skip" fact has to survive that
  // redirect and every navigation within the sitting, not just one URL.
  const handleSkip = () => {
    sessionStorage.setItem(SKIP_PASSWORD_CHANGE_KEY, '1');
    router.push('/assessment/list');
  };

  return <ChangePasswordScreen onDone={handleDone} onSkip={handleSkip} />;
}
