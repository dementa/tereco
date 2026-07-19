import { NextRequest } from 'next/server';
import { deleteUser } from '@/lib/users';
import { handleApiError, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const { staffId } = await params;
    await deleteUser(decodeURIComponent(staffId));
    return successResponse({ message: 'User deleted' });
  } catch (error) {
    return handleApiError(error, 'Delete failed');
  }
}
