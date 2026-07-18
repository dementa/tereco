import { NextRequest } from 'next/server';
import { deleteStudent } from '@/lib/students';
import { handleApiError, successResponse } from '@/lib/apiResponse';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteStudent(id);
    return successResponse({ message: 'Student deleted' });
  } catch (error) {
    return handleApiError(error, 'Delete failed');
  }
}
