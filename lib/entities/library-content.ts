import { getSupabaseAdmin } from "@/lib/supabase";
import type { TablesUpdate } from "@/lib/database.types";
import { UserFacingError } from "@/lib/apiResponse";
import type { SessionProfile } from "@/lib/auth/session";
import type { CloudinaryResourceType } from "@/lib/cloudinary";

// ─── Types ──────────────────────────────────────────────────

export type LibraryContentType =
  | "video"
  | "document"
  | "notes"
  | "support_file"
  | "audiobook"
  | "past_paper"
  | "presentation";

export type LibraryContentStatus = "draft" | "pending_approval" | "approved" | "rejected";

export interface LibraryContentTarget {
  id: string;
  schoolId: string | null;
  level: number | null;
  classId: string | null;
  studentId: string | null;
}

export interface LibraryContent {
  id: string;
  title: string;
  description: string;
  contentType: LibraryContentType;
  cloudinaryPublicId: string;
  cloudinaryResourceType: CloudinaryResourceType;
  fileBytes: number | null;
  fileFormat: string | null;
  downloadable: boolean;
  learningArea: string | null;
  createdBy: string;
  status: LibraryContentStatus;
  reviewedBy: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-content-type upload limits. No existing precedent in this repo to
 * match against — these are product defaults, not derived from anything, and
 * were called out for sign-off when the epic was scoped (issue #12/#13).
 */
export const CONTENT_TYPE_LIMITS: Record<
  LibraryContentType,
  { formats: string[]; maxBytes: number; resourceType: CloudinaryResourceType }
> = {
  video: { formats: ["mp4", "webm"], maxBytes: 500 * 1024 * 1024, resourceType: "video" },
  document: { formats: ["pdf", "doc", "docx"], maxBytes: 50 * 1024 * 1024, resourceType: "raw" },
  notes: { formats: ["pdf", "doc", "docx"], maxBytes: 20 * 1024 * 1024, resourceType: "raw" },
  support_file: { formats: ["pdf", "doc", "docx", "xls", "xlsx", "zip"], maxBytes: 50 * 1024 * 1024, resourceType: "raw" },
  audiobook: { formats: ["mp3", "m4a"], maxBytes: 300 * 1024 * 1024, resourceType: "video" }, // Cloudinary treats audio as "video" resource_type
  past_paper: { formats: ["pdf"], maxBytes: 30 * 1024 * 1024, resourceType: "raw" },
  presentation: { formats: ["pdf", "ppt", "pptx"], maxBytes: 100 * 1024 * 1024, resourceType: "raw" },
};

/** Throws with a specific, actionable message — checked before a Cloudinary signature is ever issued. */
export function validateUpload(contentType: LibraryContentType, format: string, bytes?: number): void {
  const limit = CONTENT_TYPE_LIMITS[contentType];
  const normalizedFormat = format.toLowerCase().replace(/^\./, "");
  if (!limit.formats.includes(normalizedFormat)) {
    throw new UserFacingError(
      `${contentType} uploads must be one of: ${limit.formats.join(", ")} (got .${normalizedFormat}).`
    );
  }
  if (bytes !== undefined && bytes > limit.maxBytes) {
    throw new UserFacingError(
      `${contentType} uploads are limited to ${Math.round(limit.maxBytes / (1024 * 1024))}MB.`
    );
  }
}

interface Row {
  id: string;
  title: string;
  description: string;
  content_type: string;
  cloudinary_public_id: string;
  cloudinary_resource_type: string;
  file_bytes: number | null;
  file_format: string | null;
  downloadable: boolean;
  learning_area: string | null;
  created_by: string;
  status: string;
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT =
  "id, title, description, content_type, cloudinary_public_id, cloudinary_resource_type, " +
  "file_bytes, file_format, downloadable, learning_area, created_by, status, " +
  "reviewed_by, review_reason, reviewed_at, submitted_at, created_at, updated_at";

function rowToLibraryContent(row: Row): LibraryContent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    contentType: row.content_type as LibraryContentType,
    cloudinaryPublicId: row.cloudinary_public_id,
    cloudinaryResourceType: row.cloudinary_resource_type as CloudinaryResourceType,
    fileBytes: row.file_bytes,
    fileFormat: row.file_format,
    downloadable: row.downloadable,
    learningArea: row.learning_area,
    createdBy: row.created_by,
    status: row.status as LibraryContentStatus,
    reviewedBy: row.reviewed_by,
    reviewReason: row.review_reason,
    reviewedAt: row.reviewed_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Targets ────────────────────────────────────────────────

interface TargetRow {
  id: string;
  school_id: string | null;
  level: number | null;
  class_id: string | null;
  student_id: string | null;
}

function rowToTarget(row: TargetRow): LibraryContentTarget {
  return { id: row.id, schoolId: row.school_id, level: row.level, classId: row.class_id, studentId: row.student_id };
}

export async function getLibraryContentTargets(contentId: string): Promise<LibraryContentTarget[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("library_content_targets")
    .select("id, school_id, level, class_id, student_id")
    .eq("content_id", contentId);
  if (error) throw new Error(error.message);
  return (data as TargetRow[]).map(rowToTarget);
}

/**
 * Replaces the full target set for an item — the same mechanism used both
 * for an owner narrowing their draft's audience AND for a super_admin
 * widening/restricting an approved item (deleting the whole-school row is
 * "make public"; re-adding it is "restrict to school"). Mirrors
 * replaceTargets() in lib/assessments.ts exactly.
 */
export async function replaceLibraryContentTargets(
  contentId: string,
  targets: Omit<LibraryContentTarget, "id">[]
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error: clearError } = await supabase
    .from("library_content_targets")
    .delete()
    .eq("content_id", contentId);
  if (clearError) throw new Error(clearError.message);

  // An all-null row would mean "everyone" and defeat every sibling target —
  // dropped here as well as rejected by the table's own check constraint.
  const rows = targets
    .filter((t) => t.schoolId !== null || t.level !== null || t.classId !== null || t.studentId !== null)
    .map((t) => ({
      content_id: contentId,
      school_id: t.schoolId,
      level: t.level,
      class_id: t.classId,
      student_id: t.studentId,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("library_content_targets").insert(rows);
  if (error) throw new Error(error.message);
}

// ─── Create / edit / submit ──────────────────────────────────

export interface CreateDraftInput {
  id: string; // client-generated — the same id used as the Cloudinary public_id/entity id
  title: string;
  description?: string;
  contentType: LibraryContentType;
  cloudinaryPublicId: string;
  cloudinaryResourceType: CloudinaryResourceType;
  fileBytes?: number;
  fileFormat?: string;
  learningArea?: string;
  /** Only meaningful for admin/super_admin — everyone else gets the auto-inserted whole-school row instead. */
  targets?: Omit<LibraryContentTarget, "id">[];
}

/**
 * Creates a draft item. Staff/school_admin get one auto-inserted whole-school
 * target row (their own school) — that is the entire mechanism for "scoped
 * to my school by default." Admin/super_admin get exactly the targets they
 * passed (including none, which is immediately platform-wide once approved)
 * — "full control of the audience," per lib/auth/access.ts's existing
 * admin/super_admin-are-unscoped-owners precedent for assessments.
 */
export async function createDraftLibraryContent(
  actingProfile: SessionProfile,
  input: CreateDraftInput
): Promise<LibraryContent> {
  validateUpload(input.contentType, input.fileFormat ?? "", input.fileBytes);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("library_content")
    .insert({
      id: input.id,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      content_type: input.contentType,
      cloudinary_public_id: input.cloudinaryPublicId,
      cloudinary_resource_type: input.cloudinaryResourceType,
      file_bytes: input.fileBytes ?? null,
      file_format: input.fileFormat ?? null,
      learning_area: input.learningArea?.trim() || null,
      created_by: actingProfile.id,
      status: "draft",
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);

  const isSchoolScopedRole = actingProfile.role === "staff" || actingProfile.role === "school_admin";
  if (isSchoolScopedRole) {
    if (!actingProfile.schoolId) {
      throw new UserFacingError("Your account has no school assigned — contact a super-admin.");
    }
    await replaceLibraryContentTargets(input.id, [
      { schoolId: actingProfile.schoolId, level: null, classId: null, studentId: null },
    ]);
  } else if (input.targets?.length) {
    await replaceLibraryContentTargets(input.id, input.targets);
  }

  return rowToLibraryContent(data as unknown as Row);
}

export interface UpdateLibraryContentInput {
  title?: string;
  description?: string;
  learningArea?: string | null;
}

/**
 * Editing a draft just edits it. Editing an APPROVED item resets it to
 * pending_approval and clears the prior review — prevents a post-approval
 * edit from silently bypassing moderation (epic #11, decision 12).
 */
export async function updateLibraryContent(id: string, updates: UpdateLibraryContentInput): Promise<void> {
  const existing = await getLibraryContentById(id);
  if (!existing) throw new UserFacingError("That item no longer exists.");

  const patch: TablesUpdate<"library_content"> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) patch.title = updates.title.trim();
  if (updates.description !== undefined) patch.description = updates.description.trim();
  if (updates.learningArea !== undefined) patch.learning_area = updates.learningArea?.trim() || null;

  if (existing.status === "approved") {
    patch.status = "pending_approval";
    patch.reviewed_by = null;
    patch.reviewed_at = null;
    patch.review_reason = null;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("library_content").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getLibraryContentById(id: string): Promise<LibraryContent | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("library_content").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToLibraryContent(data as unknown as Row) : null;
}

/** Everything one creator has authored, every status — the "my uploads" screen. */
export async function getMyLibraryContent(createdBy: string): Promise<LibraryContent[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("library_content")
    .select(SELECT)
    .eq("created_by", createdBy)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as Row[]).map(rowToLibraryContent);
}

export async function submitLibraryContent(id: string): Promise<void> {
  const existing = await getLibraryContentById(id);
  if (!existing) throw new UserFacingError("That item no longer exists.");
  if (existing.status !== "draft") {
    throw new UserFacingError(`This item is already ${existing.status.replace("_", " ")}.`);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("library_content")
    .update({ status: "pending_approval", submitted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Approval queue ───────────────────────────────────────────

export interface PendingLibraryContent extends LibraryContent {
  uploaderName: string;
  uploaderSchoolName: string | null;
}

interface PendingRow extends Row {
  uploader: { first_name: string; last_name: string; school: { name: string } | null } | null;
}

// schools!profiles_school_id_fkey is load-bearing, not decoration: profiles
// and schools have three FK relationships between them (a profile's own
// school, a school's contact person, a school's creator), so an unqualified
// `school:schools(...)` is ambiguous and PostgREST refuses the query rather
// than guessing which one was meant (confirmed live against a local
// Postgres+PostgREST stack — PGRST201).
const PENDING_SELECT = `${SELECT}, uploader:profiles!library_content_created_by_fkey(first_name, last_name, school:schools!profiles_school_id_fkey(name))`;

/** Every pending submission, across every school, oldest first — one unified super-admin queue. */
export async function getPendingLibraryContent(): Promise<PendingLibraryContent[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("library_content")
    .select(PENDING_SELECT)
    .eq("status", "pending_approval")
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data as unknown as PendingRow[]).map((row) => ({
    ...rowToLibraryContent(row),
    uploaderName: [row.uploader?.first_name, row.uploader?.last_name].filter(Boolean).join(" "),
    uploaderSchoolName: row.uploader?.school?.name ?? null,
  }));
}

async function getPendingItem(id: string): Promise<LibraryContent> {
  const existing = await getLibraryContentById(id);
  if (!existing) throw new UserFacingError("That item no longer exists.");
  if (existing.status !== "pending_approval") {
    throw new UserFacingError(`That item has already been ${existing.status.replace("_", " ")}.`);
  }
  return existing;
}

export async function approveLibraryContent(id: string, reviewerId: string): Promise<void> {
  await getPendingItem(id);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("library_content")
    .update({ status: "approved", reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function rejectLibraryContent(id: string, reviewerId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new UserFacingError("A rejection needs a reason.");
  await getPendingItem(id);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("library_content")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_reason: reason.trim(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Browse (for consumers) ───────────────────────────────────

export interface BrowseFilters {
  contentType?: LibraryContentType;
  learningArea?: string;
  keyword?: string;
}

/**
 * What one profile may currently browse — role-appropriate matching is done
 * entirely in library_content_for_profile() (17-library.sql) so there is
 * exactly one implementation of "may this person see this item," the same
 * reasoning getAssessmentsForStudent uses for assessments_for_student.
 */
export async function getLibraryContentForProfile(
  profileId: string,
  filters: BrowseFilters = {}
): Promise<LibraryContent[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.rpc("library_content_for_profile", { p_profile_id: profileId }).select(SELECT);

  if (filters.contentType) query = query.eq("content_type", filters.contentType);
  if (filters.learningArea) query = query.ilike("learning_area", filters.learningArea);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const items = (data as unknown as Row[]).map(rowToLibraryContent);

  // Done in-memory rather than a PostgREST `.or()` string built from raw
  // user input: a keyword containing a comma or parenthesis would otherwise
  // be parsed as filter syntax instead of the search term it's meant to be.
  if (!filters.keyword?.trim()) return items;
  const needle = filters.keyword.trim().toLowerCase();
  return items.filter(
    (item) => item.title.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle)
  );
}

/**
 * Whether one profile may currently view one specific item — used by the
 * feedback and stream/download routes, which are reached by id rather than
 * through the browse list. There is deliberately no synchronous
 * "canViewLibraryContent" in lib/auth/access.ts alongside the other Library
 * checks: matching a student against their current enrollment (or a
 * parent's linked children) needs the same database logic as the browse
 * list, so this reuses library_content_for_profile rather than
 * re-implementing it as a second, easily-divergent check.
 */
export async function canProfileViewLibraryContent(profileId: string, contentId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("library_content_for_profile", { p_profile_id: profileId })
    .select("id")
    .eq("id", contentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}
