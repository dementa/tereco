"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Client-component Supabase client — real Supabase Auth session, not localStorage. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
