import type { SessionProfile } from "@/lib/auth/session";
import type { Assessment } from "@/lib/assessments";

/**
 * Who may manage a given assessment.
 *
 * Admins and super admins see everything; a teacher sees only papers they
 * wrote. Checked in every route that reads or changes an assessment, rather
 * than relying on the list being filtered — a filtered list still leaves the
 * detail, questions, results, release and PDF routes reachable by id.
 */
export function canManageAssessment(profile: SessionProfile, assessment: Assessment): boolean {
  if (profile.role === "admin" || profile.role === "super_admin") return true;
  if (profile.role === "staff") return assessment.createdBy === profile.id;
  return false;
}

/** Staff are scoped to their own work; admins are not scoped at all. */
export function authorScopeFor(profile: SessionProfile): string | undefined {
  return profile.role === "staff" ? profile.id : undefined;
}
