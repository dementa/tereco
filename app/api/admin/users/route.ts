import { NextRequest } from 'next/server';
import { listUsers, createUser } from '@/lib/users';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const users = await listUsers();
    return successResponse({ data: users });
  } catch (error) {
    console.error('Error listing users:', error);
    return errorResponse('Failed to list users', 500);
  }
}

const CreateUserSchema = z.object({
  staffId: z.string().min(1, 'Staff ID is required'),
  passcode: z.string().min(1, 'Passcode is required'),
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  school: z.string().min(1, 'School is required'),
});

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const body = await request.json();
    const validated = CreateUserSchema.parse(body);
    const user = await createUser(validated);
    return successResponse({ data: user });
  } catch (error) {
    return handleApiError(error, 'Create failed');
  }
}
