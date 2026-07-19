import { NextRequest } from 'next/server';
import { getStudents, createStudent } from '@/lib/students';
import { errorResponse, handleApiError, successResponse } from '@/lib/apiResponse';
import { requireRole } from '@/lib/auth/session';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  const searchParams = request.nextUrl.searchParams;
  const school = searchParams.get('school') || undefined;
  const className = searchParams.get('class') || undefined;
  try {
    const students = await getStudents(school, className);
    return successResponse({ data: students });
  } catch (error) {
    console.error('Error fetching students:', error);
    return errorResponse('Failed to fetch students', 500);
  }
}

const CreateStudentSchema = z.object({
  studentId: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  school: z.string().min(1, 'School is required'),
  className: z.string().min(1, 'Class is required'),
});

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ['admin', 'super_admin']);
  if (denied) return denied;
  try {
    const body = await request.json();
    const validated = CreateStudentSchema.parse(body);
    const student = await createStudent(validated);
    return successResponse({ data: student });
  } catch (error) {
    return handleApiError(error, 'Create failed');
  }
}
