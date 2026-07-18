import { NextRequest } from 'next/server';
import { getStudents } from '@/lib/students';
import { errorResponse, successResponse } from '@/lib/apiResponse';

// Public: list students for a school/class so learners can pick their name
// on the assessment entry screen.
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const school = searchParams.get('school') || undefined;
  const className = searchParams.get('class') || undefined;

  try {
    const students = await getStudents(school, className);
    return successResponse({
      data: students.map((s) => ({ id: s.id, name: s.name })),
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    return errorResponse('Failed to fetch students', 500);
  }
}
