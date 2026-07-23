import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";
import { createAccount, type Gender } from "@/lib/entities/accounts";

export interface StudentRequest {
  id: string;
  requestedBy: string;
  requestedByName: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  classDisplayName: string;
  streamId: string | null;
  streamName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  note: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdStudentId: string | null;
  createdAt: string;
}

const SELECT =
  "id, requested_by, school_id, class_id, stream_id, first_name, middle_name, last_name, " +
  "gender, date_of_birth, note, status, reviewed_by, reviewed_at, rejection_reason, " +
  "created_student_id, created_at, " +
  "requester:profiles!student_requests_requested_by_fkey(first_name, last_name), " +
  "school:schools(name), class:classes(alias, grade_level:grade_levels(code)), stream:streams(name)";

interface Row {
  id: string;
  requested_by: string;
  school_id: string;
  class_id: string;
  stream_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: Gender | null;
  date_of_birth: string | null;
  note: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_student_id: string | null;
  created_at: string;
  requester: { first_name: string; last_name: string } | null;
  school: { name: string } | null;
  class: { alias: string | null; grade_level: { code: string } | null } | null;
  stream: { name: string } | null;
}

function rowToRequest(row: Row): StudentRequest {
  return {
    id: row.id,
    requestedBy: row.requested_by,
    requestedByName: [row.requester?.first_name, row.requester?.last_name].filter(Boolean).join(" "),
    schoolId: row.school_id,
    schoolName: row.school?.name ?? "",
    classId: row.class_id,
    classDisplayName: row.class?.alias ?? row.class?.grade_level?.code ?? "",
    streamId: row.stream_id,
    streamName: row.stream?.name ?? null,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    note: row.note,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    createdStudentId: row.created_student_id,
    createdAt: row.created_at,
  };
}

export async function createStudentRequest(input: {
  requestedBy: string;
  schoolId: string;
  classId: string;
  streamId?: string | null;
  firstName: string;
  middleName?: string;
  lastName: string;
  gender?: Gender;
  dateOfBirth?: string;
  note?: string;
}): Promise<StudentRequest> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_requests")
    .insert({
      requested_by: input.requestedBy,
      school_id: input.schoolId,
      class_id: input.classId,
      stream_id: input.streamId ?? null,
      first_name: input.firstName.trim(),
      middle_name: input.middleName?.trim() || null,
      last_name: input.lastName.trim(),
      gender: input.gender ?? null,
      date_of_birth: input.dateOfBirth ?? null,
      note: input.note?.trim() ?? "",
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "23503") {
      throw new UserFacingError("The selected school, class or stream no longer exists.");
    }
    throw new Error(error.message);
  }
  return rowToRequest(data as unknown as Row);
}

/** Super_admin sees every request; anyone else sees only the ones they filed. */
export async function listStudentRequests(filter: {
  requestedBy?: string;
  status?: "pending" | "approved" | "rejected";
}): Promise<StudentRequest[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("student_requests").select(SELECT).order("created_at", { ascending: false });
  if (filter.requestedBy) query = query.eq("requested_by", filter.requestedBy);
  if (filter.status) query = query.eq("status", filter.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as unknown as Row[]).map(rowToRequest);
}

async function getPendingRequest(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new UserFacingError("That request no longer exists.");
  if (data.status !== "pending") {
    throw new UserFacingError(`That request has already been ${data.status}.`);
  }
  return data;
}

/**
 * Turns a pending request into a real account via the same createAccount()
 * every other student goes through, then records the decision on the
 * request. If the account is created but the request update somehow fails,
 * the account still exists — a real enrolled student is not something to
 * roll back over a bookkeeping row.
 */
export async function approveStudentRequest(id: string, reviewerId: string) {
  const supabase = getSupabaseAdmin();
  const request = await getPendingRequest(id);

  const account = await createAccount({
    role: "student",
    firstName: request.first_name,
    middleName: request.middle_name ?? undefined,
    lastName: request.last_name,
    gender: (request.gender as Gender) ?? undefined,
    dateOfBirth: request.date_of_birth ?? undefined,
    schoolId: request.school_id,
    classId: request.class_id,
    streamId: request.stream_id ?? undefined,
    createdBy: reviewerId,
  });

  const { error } = await supabase
    .from("student_requests")
    .update({
      status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      created_student_id: account.profileId,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  return { request: { requestedBy: request.requested_by as string }, account };
}

export async function rejectStudentRequest(id: string, reviewerId: string, reason: string) {
  if (!reason.trim()) throw new UserFacingError("A rejection needs a reason.");
  const request = await getPendingRequest(id);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("student_requests")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason.trim(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  return { requestedBy: request.requested_by as string };
}
