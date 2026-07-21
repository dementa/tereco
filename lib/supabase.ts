import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Returns a server-side Supabase client authenticated with the service-role key.
 * This must only ever be used in server code (API routes / server components) —
 * the service-role key bypasses Row Level Security and must never reach the browser.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
