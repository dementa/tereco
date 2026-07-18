import { NextRequest, NextResponse } from 'next/server';
import { getAssessments } from '@/lib/assessments';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const school = searchParams.get('school') || undefined;
  const className = searchParams.get('class') || undefined;

  try {
    const assessments = await getAssessments(school, className);
    return NextResponse.json({ success: true, data: assessments });
  } catch (error) {
    console.error('Error in /api/assessments:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch assessments' },
      { status: 500 }
    );
  }
}