import { AuthProvider } from '@/components/auth/AuthContext';

export default function AssessmentLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
