import { NextRequest } from "next/server";
import {
  getPracticalTermScores,
  listStaffRounds,
  summariseClass,
} from "@/lib/entities/practical-observations";
import { getCurrentTermId } from "@/lib/entities/performance";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { getCurrentProfile } from "@/lib/auth/session";

/**
 * One class rolled up by skill, for the teacher who scored it.
 *
 * This is the only thing this feature gives back to the person carrying its
 * cost. A teacher makes ~287 judgements a round and, until this existed, saw
 * nothing but a queue of what they still owed. "18 of 30 most often need support
 * on two-hand typing" is worth more to them than any individual learner's bands,
 * because it says what to reteach next week.
 *
 * Scoped to classes this teacher has actually taken a register for. Not a
 * permissions afterthought — a teacher browsing another class's practical
 * standing is a different feature with different consent, and this is not it.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);
    if (profile.role !== "staff") return errorResponse("Forbidden", 403);

    const classId = request.nextUrl.searchParams.get("classId");
    if (!classId) return errorResponse("A class must be identified.", 400);
    const streamId = request.nextUrl.searchParams.get("streamId");

    // Checked by id rather than trusting the picker to have offered only their
    // own classes — a filtered list still leaves this reachable by URL.
    const rounds = await listStaffRounds(profile.id, 200);
    const owns = rounds.some(
      (r) => r.classId === classId && (!streamId || r.streamId === streamId)
    );
    if (!owns) return errorResponse("You have not taken a register for that class.", 403);

    if (!profile.schoolId) return errorResponse("No school on your account.", 400);
    const termId = await getCurrentTermId(profile.schoolId);
    // No term covering today means no term-scoped figure to give. Say so rather
    // than silently widening to the whole year.
    if (!termId) return successResponse({ data: { termId: null, learners: 0, aspects: [] } });

    const scores = await getPracticalTermScores({
      termId,
      classId,
      streamId: streamId ?? undefined,
    });

    return successResponse({
      data: { termId, learners: scores.length, aspects: summariseClass(scores) },
    });
  } catch (error) {
    return handleApiError(error, "Could not load the class summary.");
  }
}
