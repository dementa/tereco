import { getSupabaseAdmin } from "./supabase";

export type SystemIdEntity =
  | "admin"
  | "staff"
  | "student"
  | "parent"
  | "school"
  | "assessment";

/**
 * Atomically generates the next system ID for an entity type via the
 * `generate_system_id` Postgres function (see scripts/supabase-schema.sql).
 * Never compute these client-side by counting existing rows — that's what
 * caused the duplicate Q1/Q2 question-row bug.
 */
export async function generateSystemId(
  entityType: SystemIdEntity
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("generate_system_id", {
    p_entity_type: entityType,
  });

  if (error) {
    throw new Error(`Failed to generate system ID for ${entityType}: ${error.message}`);
  }
  return data as string;
}
