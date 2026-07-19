import { NextRequest } from 'next/server';
import { deleteStudent } from '@/lib/students';
import { handleApiError, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const { id } = await params;
    await deleteStudent(id);
    return successResponse({ message: 'Student deleted' });
  } catch (error) {
    return handleApiError(error, 'Delete failed');
  }
}
