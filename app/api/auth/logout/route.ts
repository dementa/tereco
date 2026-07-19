import { createClient } from "@/lib/auth/supabase-server";
import { successResponse } from "@/lib/apiResponse";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return successResponse();
}
