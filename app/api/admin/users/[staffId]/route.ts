import { NextRequest } from 'next/server';
import { deleteUser } from '@/lib/users';
import { handleApiError, successResponse } from '@/lib/apiResponse';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    const { staffId } = await params;
    await deleteUser(decodeURIComponent(staffId));
    return successResponse({ message: 'User deleted' });
  } catch (error) {
    return handleApiError(error, 'Delete failed');
  }
}
