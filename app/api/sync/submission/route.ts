import { NextRequest } from "next/server";
import { createPublicKey } from "node:crypto";
import { z } from "zod";
import {
  AUTO_SCORED_TYPES,
  getAssessmentBySystemId,
  getQuestions,
  saveSubmission,
  type SubmissionAnswer,
} from "@/lib/assessments";
import { getCurrentEnrollment, getEnrollmentAt } from "@/lib/entities/enrollments";
import { errorResponse, handleApiError, successResponse } from "@/lib/apiResponse";
import { packageSigningKey } from "@/lib/offline/keys";
import { verifyPackageToken } from "@/lib/offline/package-token";

/**
 * Receives an assessment that was sat offline (issue #33, Phase 5 of the flow).
 *
 * Two things make this different from the online submit route, and both matter:
 *
 * **Authorisation comes from the signed grant, not a session.** The lab machine
 * may upload days after the paper was sat, long after any cookie expired and
 * possibly with the learner nowhere near it. The Ed25519 token issued at
 * preparation is the proof, and identity is read from its claims — never from
 * the request body, which the device could rewrite.
 *
 * **The assessment window is deliberately not re-checked.** The online route
 * refuses a submission once `closesAt` has passed or the status leaves
 * `published`, which is right when someone is sitting there. Here it would
 * throw away a paper that was legitimately sat inside the window and simply
 * could not be uploaded until later — the exact situation this whole feature
 * exists for. The signed `startedAt` is the evidence the sitting was genuine,
 * and the time limit is still enforced against it below.
 */

const SyncSchema = z.object({
  token: z.string().min(1),
  attemptId: z.string().min(1),
  deviceId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
  timeSpentSeconds: z.number().min(0),
  /** Epoch ms the device marked the attempt submitted. */
  submittedAt: z.number().min(0),
});

/** Allowance for the clock skew between a lab machine and the server. */
const TIME_LIMIT_GRACE_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    const body = SyncSchema.parse(await request.json());

    // The server holds the private key; the public half is derived from it
    // rather than configured separately, so the two can never drift apart.
    const publicPem = createPublicKey(packageSigningKey())
      .export({ type: "spki", format: "pem" })
      .toString();

    let claims;
    try {
      claims = verifyPackageToken(body.token, { [publicKeyId(body.token)]: publicPem });
    } catch (error) {
      // A bad signature is not a server problem and not something a retry will
      // fix, so say so rather than letting the device loop on it forever.
      return errorResponse(
        error instanceof Error ? error.message : "This submission could not be verified.",
        403
      );
    }

    if (claims.deviceId !== body.deviceId) {
      return errorResponse("This submission came from a different computer than it was issued to.", 403);
    }

    const assessment = await getAssessmentBySystemId(claims.assessmentSystemId);
    if (!assessment) return errorResponse("Assessment not found", 404);

    const allowed = claims.durationSeconds + TIME_LIMIT_GRACE_SECONDS;
    if (body.timeSpentSeconds > allowed) {
      // Recorded rather than rejected: the paper is real work and refusing it
      // would destroy it. Marking is a human decision, and the flag is what
      // gives a teacher the chance to make it.
      console.warn(
        `[sync] over-time submission for attempt ${body.attemptId}: ` +
          `${body.timeSpentSeconds}s against ${allowed}s allowed`
      );
    }

    /**
     * The enrolment the learner sat under, not their current one.
     *
     * A submission can arrive after a promotion or a transfer, and recording it
     * against today's class would file the result in a class the paper was
     * never sat in.
     */
    let enrollment = await getEnrollmentAt(claims.studentId, claims.startedAt);
    if (!enrollment) {
      // History did not cover the instant — a sitting on the day of a move, or
      // a gap in the record. Fall back rather than reject: filing the result in
      // a slightly wrong class is recoverable, and throwing the paper away is
      // not.
      console.warn(
        `[sync] no enrolment covering ${new Date(claims.startedAt).toISOString()} ` +
          `for student ${claims.studentId}; falling back to current enrolment`
      );
      enrollment = await getCurrentEnrollment(claims.studentId);
    }
    if (!enrollment) {
      return errorResponse(
        "This learner has no enrolment on record, so the assessment cannot be filed.",
        409
      );
    }

    const questions = await getQuestions(assessment.id);

    const norm = (s: string) => s.trim().toLowerCase();
    const answers: SubmissionAnswer[] = questions.map((q) => {
      const given = body.answers[q.id] ?? "";

      // Identical marking to the online route. A paper must not score
      // differently for having been sat offline.
      let score: number | undefined;
      if (AUTO_SCORED_TYPES.has(q.questionType) && q.correctAnswer) {
        if (q.questionType === "checkbox") {
          const a = given.split("|").map(norm).filter(Boolean).sort();
          const b = q.correctAnswer.split("|").map(norm).filter(Boolean).sort();
          score = a.length === b.length && a.every((v, i) => v === b[i]) ? q.maxScore : 0;
        } else {
          score = norm(given) === norm(q.correctAnswer) ? q.maxScore : 0;
        }
      }

      return { questionId: q.id, answer: given, score, isAutoScored: score !== undefined };
    });

    try {
      await saveSubmission({
        assessmentId: assessment.id,
        studentId: claims.studentId,
        enrollmentId: enrollment.enrollmentId,
        timeSpentSeconds: body.timeSpentSeconds,
        answers,
      });
    } catch (error) {
      /**
       * Idempotency, and the reason the device can retry freely.
       *
       * `unique (assessment_id, student_id)` on assessment_submissions means a
       * replay collides instead of duplicating. A retry after a response was
       * lost in transit is the ordinary case — the work did land — so this is
       * success, not an error the learner should ever see.
       *
       * First write wins. The existing submission is never overwritten: it may
       * already have been marked, and a later upload of the same attempt has no
       * claim to replace a teacher's work.
       */
      if (error instanceof Error && error.message === "ALREADY_SUBMITTED") {
        return successResponse({
          message: "This assessment was already synchronised.",
          alreadySynced: true,
        });
      }
      throw error;
    }

    return successResponse({ message: "Assessment synchronised", alreadySynced: false });
  } catch (error) {
    return handleApiError(error, "Could not synchronise this submission");
  }
}

/**
 * Reads the key id from the token's unsigned header, purely to select which
 * public key to check it against.
 *
 * Trusting nothing: `verifyPackageToken` rejects a token whose header kid does
 * not match the signed claims, so a rewritten header cannot point verification
 * at a key of the caller's choosing.
 */
function publicKeyId(token: string): string {
  try {
    const [header] = token.split(".");
    return JSON.parse(Buffer.from(header, "base64url").toString("utf8")).kid ?? "";
  } catch {
    return "";
  }
}
