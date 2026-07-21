import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Supabase client for Route Handlers / Server Components / Server Actions.
 * Create a fresh one per request — never share across requests.
 *
 * Server Components can read cookies but not write them (React's rules), so
 * `setAll` here is best-effort; `proxy.ts` is what actually refreshes
 * an expiring session on every request.
 */
export async function createClient() {
  const cookieStore = await cookies(); // Next.js App Router: cookies() is async

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts handles the actual refresh-write in that case.
        }
      },
    },
  });
}
