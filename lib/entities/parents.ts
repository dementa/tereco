import { getSupabaseAdmin } from "@/lib/supabase";

export async function linkParentToStudent(parentId: string, studentId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("parent_students")
    .insert({ parent_id: parentId, student_id: studentId });
  if (error) throw new Error(error.message);
}

export async function unlinkParentFromStudent(parentId: string, studentId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("parent_students")
    .delete()
    .eq("parent_id", parentId)
    .eq("student_id", studentId);
  if (error) throw new Error(error.message);
}

export interface LinkedStudent {
  id: string;
  systemId: string | null;
  name: string;
}

export async function getLinkedStudents(parentId: string): Promise<LinkedStudent[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("parent_students")
    .select("student_id, profiles!parent_students_student_id_fkey(id, system_id, name)")
    .eq("parent_id", parentId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => row.profiles as unknown as { id: string; system_id: string | null; name: string } | null)
    .filter((p): p is { id: string; system_id: string | null; name: string } => !!p)
    .map((p) => ({ id: p.id, systemId: p.system_id, name: p.name }));
}
