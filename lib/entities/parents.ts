import { getSupabaseAdmin } from "@/lib/supabase";
import { UserFacingError } from "@/lib/apiResponse";

export interface LinkedStudent {
  id: string;
  systemId: string | null;
  name: string;
  relationship: string | null;
  isPrimary: boolean;
  /** Current placement, from the open enrolment. Null when not enrolled. */
  className: string | null;
}

export async function linkParentToStudent(
  parentId: string,
  studentId: string,
  options: { relationship?: string; isPrimary?: boolean } = {}
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("parent_students").insert({
    parent_id: parentId,
    student_id: studentId,
    relationship: options.relationship ?? null,
    is_primary: options.isPrimary ?? false,
  });

  if (error) {
    if (error.code === "23505") {
      throw new UserFacingError("That student is already linked to this parent.");
    }
    throw new Error(error.message);
  }
}

export async function unlinkParentFromStudent(
  parentId: string,
  studentId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("parent_students")
    .delete()
    .eq("parent_id", parentId)
    .eq("student_id", studentId);
  if (error) throw new Error(error.message);
}

interface LinkRow {
  student_id: string;
  relationship: string | null;
  is_primary: boolean;
  student: {
    id: string;
    system_id: string | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
  } | null;
}

// Single string literal so the client can actually check these columns. The
// previous version selected `profiles(name)` — a column that no longer exists —
// and an `as unknown as` cast hid that from the compiler until runtime.
const LINK_COLUMNS =
  "student_id, relationship, is_primary, student:profiles!parent_students_student_id_fkey(id, system_id, first_name, middle_name, last_name)";

export async function getLinkedStudents(parentId: string): Promise<LinkedStudent[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("parent_students")
    .select(LINK_COLUMNS)
    .eq("parent_id", parentId);
  if (error) throw new Error(error.message);

  const rows = (data as unknown as LinkRow[]).filter((row) => row.student !== null);
  if (rows.length === 0) return [];

  // Placement lives in enrolments, so it is a second lookup rather than a
  // column on the student.
  const { data: enrollments } = await supabase
    .from("current_enrollments")
    .select("student_id, class_display_name, stream_name")
    .in(
      "student_id",
      rows.map((r) => r.student_id)
    );

  const placement = new Map<string, string>();
  for (const e of enrollments ?? []) {
    if (e.student_id === null) continue;
    placement.set(
      e.student_id,
      [e.class_display_name, e.stream_name].filter(Boolean).join(" ")
    );
  }

  return rows.map((row) => {
    const student = row.student!;
    return {
      id: student.id,
      systemId: student.system_id,
      name: [student.first_name, student.middle_name, student.last_name]
        .filter(Boolean)
        .join(" ")
        .trim(),
      relationship: row.relationship,
      isPrimary: row.is_primary,
      className: placement.get(student.id) ?? null,
    };
  });
}
