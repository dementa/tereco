import { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  getLibraryContentForProfile,
  getLibraryPlaybackInfo,
  getPublicLibraryContent,
  type BrowsableLibraryContent,
} from "@/lib/entities/library-content";
import { getPublishedQuizzesForContents, type LibraryQuiz } from "@/lib/entities/library-quizzes";
import { isOfflineCapable, toOfflineItem } from "@/lib/library-offline";
import { handleApiError, successResponse } from "@/lib/apiResponse";

/**
 * The library TERECO Collect keeps on a lab machine.
 *
 * Works WITHOUT a session: public items (approved, no audience targets) are
 * already visible to every signed-in role, and the desktop shows them before
 * anyone signs in so the library is usable at a desk with nobody logged in and
 * the internet off.
 *
 * With a student session it also returns that learner's targeted items, marked
 * "personal" — the device files them under the learner and shows them to no one
 * else. Other roles get the public set only: the desktop is a learner client.
 *
 * Published quizzes travel WITH their answers. Offline there is no /check to
 * ask, and these are untimed practice quizzes that record nothing; the local
 * database they land in is encrypted.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile(request).catch(() => null);
    const student = profile?.role === "student" ? profile : null;

    const publicItems = await getPublicLibraryContent();
    const publicIds = new Set(publicItems.map((i) => i.id));

    const personalItems: BrowsableLibraryContent[] = student
      ? (await getLibraryContentForProfile(student.id)).filter((i) => !publicIds.has(i.id))
      : [];

    const entries = [
      ...publicItems.map((item) => ({ item, audience: "public" as const })),
      ...personalItems.map((item) => ({ item, audience: "personal" as const })),
    ]
      .map((entry) => ({ ...entry, playback: getLibraryPlaybackInfo(entry.item) }))
      .filter(({ item, playback }) => isOfflineCapable(item, playback));

    const quizzes = await getPublishedQuizzesForContents(entries.map((e) => e.item.id));
    const quizzesByContent = new Map<string, LibraryQuiz[]>();
    for (const quiz of quizzes) {
      quizzesByContent.set(quiz.contentId, [...(quizzesByContent.get(quiz.contentId) ?? []), quiz]);
    }

    return successResponse({
      data: {
        viewerId: student?.id ?? null,
        items: entries.map(({ item, playback, audience }) =>
          toOfflineItem(item, playback, quizzesByContent.get(item.id) ?? [], audience)
        ),
      },
    });
  } catch (error) {
    return handleApiError(error, "Could not load the offline library");
  }
}
