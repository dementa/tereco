import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/auth/env";

/**
 * Refreshes an expiring Supabase Auth session on every request. Without this,
 * Server Components can read but not write cookies, so a session would go
 * stale silently mid-navigation instead of being refreshed.
 *
 * Renamed from `middleware` in Next.js 16 (the `middleware` file convention
 * and named export are both deprecated). This deliberately only refreshes the
 * token — authorization lives in the route handlers and the admin layout,
 * because Proxy runs at the network boundary and must not be the only gate.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser(); // triggers a refresh if the access token has expired

  // Coarse, session-only check: bounce a fully unauthenticated request away
  // from a protected prefix before any client code runs, so there's no flash
  // of protected content while AuthContext rehydrates. Role correctness is
  // deliberately NOT decided here — that stays with PortalGate/`/auth`, kept
  // to exactly one place (lib/auth/portals.ts) rather than duplicated at the
  // edge.
  const { pathname } = request.nextUrl;
  const needsSession =
    pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname === "/staff" || pathname.startsWith("/staff/") ||
    pathname.startsWith("/assessment/");
  if (needsSession && !data.user) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
