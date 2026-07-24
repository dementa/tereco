'use client';

import { useRouter } from 'next/navigation';
import { AttendanceForm } from '@/components/staff/AttendanceForm';

export default function NewAttendancePage() {
  const router = useRouter();
  return <AttendanceForm onBack={() => router.push('/staff/attendance')} />;
}
