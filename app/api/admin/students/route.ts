import { NextRequest, NextResponse } from 'next/server';
import { getStudents, createStudent } from '@/lib/students';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const school = searchParams.get('school') || undefined;
  const className = searchParams.get('class') || undefined;
  try {
    const students = await getStudents(school, className);
    return NextResponse.json({ success: true, data: students });
  } catch (error) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch students' },
      { status: 500 }
    );
  }
}

const CreateStudentSchema = z.object({
  studentId: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  school: z.string().min(1, 'School is required'),
  className: z.string().min(1, 'Class is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CreateStudentSchema.parse(body);
    const student = await createStudent(validated);
    return NextResponse.json({ success: true, data: student });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Create failed' },
      { status: 500 }
    );
  }
}
