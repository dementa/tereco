import { NextRequest } from 'next/server';
import { updateResponseScore } from '@/lib/assessments';
import { handleApiError, successResponse } from '@/lib/apiResponse';
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
    return successResponse({ message: 'Score updated' });
  } catch (error) {
    return handleApiError(error, 'Update failed');
  }
}
