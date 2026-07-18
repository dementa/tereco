import { NextRequest, NextResponse } from 'next/server';
import { updateResponseScore } from '@/lib/assessments';
import { z } from 'zod';

const ScoreSchema = z.object({
  score: z.number().min(0),
});

// PATCH /api/admin/responses/[id] – manual marking of a single response
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { score } = ScoreSchema.parse(body);
    await updateResponseScore(id, score);
    return NextResponse.json({ success: true, message: 'Score updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}
