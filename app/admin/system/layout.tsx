import { PortalGate } from '@/components/auth/PortalGate';
import type { Role } from '@/lib/auth/session';

const SUPER_ADMIN_ROLES: Role[] = ['super_admin'];

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return <PortalGate roles={SUPER_ADMIN_ROLES}>{children}</PortalGate>;
}
