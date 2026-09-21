import { NextRequest } from "next/server";
import { getCurrentProfile, requireRole, type Role, type SessionProfile } from "@/lib/auth/session";
import { canManageLibraryContent } from "@/lib/auth/access";
import { canProfileViewLibraryContent, getLibraryContentById } from "@/lib/entities/library-content";
import { getQuiz, type LibraryQuiz } from "@/lib/entities/library-quizzes";
import { errorResponse } from "@/lib/apiResponse";

const ALL_ROLES: Role[] = ["staff", "school_admin", "admin", "super_admin", "student", "parent"];
const AUTHOR_ROLES: Role[] = ["staff", "admin", "super_admin"];

type Loaded = { quiz: LibraryQuiz; profile: SessionProfile; canManage: boolean } | { response: Response };

/**
 * Loads a quiz and decides what the caller may do with it — the one place
 * that logic lives, so every quiz route answers "who may touch this" the same
 * way. Managing a quiz means managing the document it hangs off: a quiz has
 * no owner of its own beyond that. Anyone who may view the document may take
 * its PUBLISHED quizzes; drafts are the author's alone.
 *
 * A quiz the caller may not see gets the same 404 as a missing one.
 */
export async function loadQuiz(
  request: NextRequest,
  quizId: string,
  mode: "manage" | "play"
): Promise<Loaded> {
  const denied = await requireRole(request, mode === "manage" ? AUTHOR_ROLES : ALL_ROLES);
  if (denied) return { response: denied };

  const profile = await getCurrentProfile(request);
  if (!profile) return { response: errorResponse("Unauthorized", 401) };

  const notFound = { response: errorResponse("That quiz no longer exists.", 404) };
  const quiz = await getQuiz(quizId);
  if (!quiz) return notFound;

  const content = await getLibraryContentById(quiz.contentId);
  if (!content) return notFound;

  const canManage = canManageLibraryContent(profile, content);
  if (mode === "manage") return canManage ? { quiz, profile, canManage } : { response: errorResponse("Forbidden", 403) };

  if (canManage) return { quiz, profile, canManage };
  if (quiz.status !== "published") return notFound;
  if (!(await canProfileViewLibraryContent(profile.id, quiz.contentId))) return notFound;
  return { quiz, profile, canManage };
}
