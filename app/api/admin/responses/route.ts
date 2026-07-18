import { NextRequest, NextResponse } from 'next/server';
import { getResponses, getQuestions, getAssessmentById } from '@/lib/assessments';

// GET /api/admin/responses?assessmentId=... – responses + questions for marking
export async function GET(request: NextRequest) {
  const assessmentId = request.nextUrl.searchParams.get('assessmentId');
  if (!assessmentId) {
    return NextResponse.json(
      { success: false, message: 'assessmentId is required' },
      { status: 400 }
    );
  }
  try {
    const [assessment, responses, questions] = await Promise.all([
      getAssessmentById(assessmentId),
      getResponses(assessmentId),
      getQuestions(assessmentId),
    ]);
    return NextResponse.json({
      success: true,
      data: { assessment, responses, questions },
    });
  } catch (error) {
    console.error('Error fetching responses:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch responses' },
      { status: 500 }
    );
  }
}
