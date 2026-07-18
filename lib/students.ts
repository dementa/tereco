import { getSupabaseAdmin } from "./supabase";

export interface Student {
  id: string;
  studentId: string;
  name: string;
  school: string;
  className: string;
}

export interface CreateStudentInput {
  studentId?: string;
  name: string;
  school: string;
  className: string;
}

interface StudentRow {
  id: string;
  student_id: string | null;
  name: string | null;
  school: string | null;
  class_name: string | null;
}

function rowToStudent(row: StudentRow): Student {
  return {
    id: row.id,
    studentId: row.student_id ?? "",
    name: row.name ?? "",
    school: row.school ?? "",
    className: row.class_name ?? "",
  };
}

export async function getStudents(
  school?: string,
  className?: string
): Promise<Student[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("students")
    .select("id, student_id, name, school, class_name")
    .order("name", { ascending: true });

  if (school) query = query.eq("school", school);
  if (className) query = query.eq("class_name", className);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching students:", error);
    return [];
  }
  return (data ?? []).map(rowToStudent);
}

export async function createStudent(input: CreateStudentInput): Promise<Student> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("students")
    .insert({
      student_id: input.studentId ?? "",
      name: input.name,
      school: input.school,
      class_name: input.className,
    })
    .select("id, student_id, name, school, class_name")
    .single();

  if (error) throw new Error(error.message);
  return rowToStudent(data);
}

export async function deleteStudent(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
