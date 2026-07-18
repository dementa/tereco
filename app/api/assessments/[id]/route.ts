import { NextRequest, NextResponse } from 'next/server';
import { getAssessmentById } from '@/lib/assessments';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return NextResponse.json(
        { success: false, message: 'Assessment not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: assessment });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch assessment' },
      { status: 500 }
    );
  }
}