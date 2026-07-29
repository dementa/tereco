import type { Role } from '@/lib/auth/session';

/** The one place that decides which portal a role lands in after /auth. */
export const PORTAL_FOR_ROLE: Partial<Record<Role, string>> = {
  student: '/student/dashboard',
  staff: '/staff',
  admin: '/admin',
  super_admin: '/admin/system',
  school_admin: '/school-admin',
  parent: '/parent/dashboard',
};
