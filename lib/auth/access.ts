import type { SessionProfile } from "@/lib/auth/session";
import type { Assessment } from "@/lib/assessments";
import type { LibraryContent } from "@/lib/entities/library-content";

/**
 * The assessment's true owner: whoever can delete it or release its
 * results. Deliberately narrower than canManageAssessment — a collaborator
 * added by the owner can edit and mark the paper, but adding them must not
 * hand them the ability to delete the paper or remove the person who added
 * them.
 */
export function isAssessmentOwner(profile: SessionProfile, assessment: Assessment): boolean {
  if (profile.role === "admin" || profile.role === "super_admin") return true;
  return profile.role === "staff" && assessment.createdBy === profile.id;
}

/**
 * Who may manage (edit questions/instructions/audience, view for editing) a
 * given assessment.
 *
 * Some admins who create an assessment are not teachers and cannot write
 * its questions themselves — so an owner (see isAssessmentOwner) may add a
 * teacher as a collaborator on that one assessment, standing in for the
 * ability to complete and maintain its content. Checked in every route that
 * reads or changes an assessment, rather than relying on the list being
 * filtered — a filtered list still leaves the detail, questions, results and
 * PDF routes reachable by id.
 */
export function canManageAssessment(profile: SessionProfile, assessment: Assessment): boolean {
  if (isAssessmentOwner(profile, assessment)) return true;
  return profile.role === "staff" && assessment.collaboratorIds.includes(profile.id);
}

/** Staff are scoped to their own work; admins are not scoped at all. */
export function authorScopeFor(profile: SessionProfile): string | undefined {
  return profile.role === "staff" ? profile.id : undefined;
}

/**
 * Who may mark a given assessment — broader than canManageAssessment.
 *
 * An admin can author a paper and target it at a school without that
 * school's own teacher ever being able to see who sat it. A teacher is
 * entitled to mark anything their own school's students could have taken:
 * their own papers or ones they collaborate on (canManageAssessment), any
 * paper explicitly targeted at their school, and any untargeted paper (no
 * targets = open to every school). Marking is not owning, though — deleting
 * the assessment or releasing its results stays with isAssessmentOwner.
 */
export function canMarkAssessment(profile: SessionProfile, assessment: Assessment): boolean {
  if (canManageAssessment(profile, assessment)) return true;
  if (profile.role !== "staff" || !profile.schoolId) return false;
  return (
    assessment.targets.length === 0 ||
    assessment.targets.some((t) => t.schoolId === profile.schoolId)
  );
}

/**
 * Who may edit a Library item's own fields (title/description/etc) or
 * delete it — the creator, or admin/super_admin unscoped, mirroring
 * isAssessmentOwner. Note this is narrower than who may APPROVE it
 * (canApproveLibraryContent below): a school-admin managing their own
 * upload still cannot approve it.
 */
export function canManageLibraryContent(profile: SessionProfile, content: LibraryContent): boolean {
  if (profile.role === "admin" || profile.role === "super_admin") return true;
  return content.createdBy === profile.id;
}

/**
 * Approval is strictly super_admin — not admin, not school_admin, not the
 * item's own creator — per epic #11's explicit, repeated product direction.
 * Deliberately not folded into canManageLibraryContent, which DOES include
 * admin: managing (editing) and approving are different powers here.
 */
export function canApproveLibraryContent(profile: SessionProfile): boolean {
  return profile.role === "super_admin";
}

/**
 * Who may replace an item's audience-target rows — this is also how "make
 * public" (delete the whole-school row) and "restrict to school" (re-add
 * it) happen, so it stays open to admin/super_admin even after approval,
 * not just to the original creator while still in draft/pending.
 */
export function canEditLibraryContentTargets(profile: SessionProfile, content: LibraryContent): boolean {
  if (profile.role === "admin" || profile.role === "super_admin") return true;
  return (
    content.createdBy === profile.id &&
    (content.status === "draft" || content.status === "pending_approval")
  );
}

/** Private feedback is visible only to the content's own creator and to admin/super_admin — never other viewers. */
export function canViewLibraryFeedback(profile: SessionProfile, content: LibraryContent): boolean {
  if (profile.role === "admin" || profile.role === "super_admin") return true;
  return content.createdBy === profile.id;
}
