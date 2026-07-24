import { PortalGate } from '@/components/auth/PortalGate';
import type { Role } from '@/lib/auth/session';

const STUDENT_ROLES: Role[] = ['student'];

export default function ProtectedAssessmentLayout({ children }: { children: React.ReactNode }) {
  return <PortalGate roles={STUDENT_ROLES}>{children}</PortalGate>;
}
