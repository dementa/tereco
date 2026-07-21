import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/auth/session";
import { errorResponse, successResponse } from "@/lib/apiResponse";

/**
 * The canonical P.1-P.7 ladder. Fixed reference data, not user-editable —
 * it is the join key that makes cross-school reporting possible, so a school
 * renaming its classes changes `classes.alias`, never this.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("grade_levels")
      .select("level, code, name")
      .order("level");
    if (error) throw new Error(error.message);
    return successResponse({ data });
  } catch (error) {
    console.error("Error listing grade levels:", error);
    return errorResponse("Failed to list grade levels", 500);
  }
}
