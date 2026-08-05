import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth/session";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import {
  bulkAffirmRemainder,
  completeRound,
  getScorableSession,
  saveObservations,
  PRACTICAL_ASPECTS,
  PRACTICAL_BANDS,
  type PracticalAspect,
  type PracticalBand,
} from "@/lib/entities/practical-observations";

/**
 * Practical lab-skills scoring.
 *
 * ─── Why this is staff-only, and only their own lesson ──────────────────────
 * Nearly every other route here widens to admin/super_admin, because an admin
 * managing a school's data is ordinary. Scoring is different in kind: an
 * observation is a first-hand judgement of a child at a machine, made by the
 * person who was in the room. An admin "correcting" a band did not see the
 * lesson, so the value they would write is not an observation, it is a guess
 * wearing one's clothes — and once stored, the two are indistinguishable.
 *
 * getScorableSession enforces the ownership half by id rather than trusting a
 * filtered list, the same reasoning canManageAssessment carries in
 * lib/auth/access.ts: a filtered list still leaves every route reachable by id.
 *
 * The staff id comes from the verified session and never from the request body,
 * matching the rule lesson_reports already follows (03-collection.sql:25). A
 * body-supplied scorer would let anyone file observations under another
 * teacher's name.
 */

const aspectCodes = PRACTICAL_ASPECTS.map((a) => a.code) as [PracticalAspect, ...PracticalAspect[]];
const bandCodes = PRACTICAL_BANDS.map((b) => b.code) as [PracticalBand, ...PracticalBand[]];

const SaveSchema = z.object({
  sessionId: z.string().uuid("A lesson must be identified"),
  action: z.literal("save"),
  aspect: z.enum(aspectCodes),
  entries: z
    .array(
      z.object({
        lessonAttendanceId: z.string().uuid(),
        band: z.enum(bandCodes),
      })
    )
    .min(1, "Nothing to save"),
});

const AffirmSchema = z.object({
  sessionId: z.string().uuid("A lesson must be identified"),
  action: z.literal("affirm"),
  aspect: z.enum(aspectCodes),
  band: z.enum(bandCodes),
});

const CompleteSchema = z.object({
  sessionId: z.string().uuid("A lesson must be identified"),
  action: z.literal("complete"),
});

const BodySchema = z.discriminatedUnion("action", [SaveSchema, AffirmSchema, CompleteSchema]);

/** The round as the scoring screen needs it: present learners and their bands so far. */
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);
    if (profile.role !== "staff") return errorResponse("Forbidden", 403);

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) return errorResponse("A lesson must be identified.", 400);

    const data = await getScorableSession(sessionId, profile.id);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Could not open this lesson.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) return errorResponse("Unauthorized", 401);
    if (profile.role !== "staff") return errorResponse("Forbidden", 403);

    const body = BodySchema.parse(await request.json());

    switch (body.action) {
      case "save": {
        // Idempotent by design — the entity layer upserts on
        // (lesson_attendance_id, aspect). That is what lets the client hold
        // unsynced taps in a localStorage outbox and replay them after a
        // network drop without having to reason about what already landed.
        await saveObservations({
          sessionId: body.sessionId,
          staffId: profile.id,
          aspect: body.aspect,
          entries: body.entries,
        });
        break;
      }

      case "affirm": {
        // Server-side remainder fill. The scoring screen stages this locally as
        // ordinary taps instead, so it behaves identically offline — this path
        // exists for any caller that is online and would rather not send 41
        // entries to say one thing.
        await bulkAffirmRemainder({
          sessionId: body.sessionId,
          staffId: profile.id,
          aspect: body.aspect,
          band: body.band,
        });
        break;
      }

      case "complete": {
        const data = await completeRound(body.sessionId, profile.id);
        return successResponse({ data });
      }
    }

    // Return the round as it now stands, so the client re-syncs from the server
    // rather than trusting its own optimistic copy after a write.
    const data = await getScorableSession(body.sessionId, profile.id);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Could not save that scoring.");
  }
}
