import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/lib/env.client";

type PendingCookie = { name: string; value: string; options?: CookieOptions };

/**
 * Refreshes the Supabase auth session for the request AND enforces route
 * protection — this is Module 3's completion of the session-refresh-only
 * version shipped in Module 1.
 *
 * Uses getClaims() rather than getUser(): getClaims() verifies the JWT
 * signature locally against the project's published JWKS without a
 * redundant database round trip for the "is there a valid session at
 * all" question. Only invoked for /admin, /dashboard, /login, /register,
 * and /auth per the scoped matcher in proxy.ts — public marketing and
 * catalog pages (where Meta ad traffic lands) never pay this overhead.
 *
 * CORRECTED cookie handling: @supabase/ssr's setAll callback fires
 * whenever the session is refreshed (e.g. an access token rotated during
 * getClaims()), and the previous revision of this file wrote those
 * refreshed cookies onto a `response` variable that only the final
 * "no redirect needed" fallthrough path actually returned. Every redirect
 * branch built its own brand-new NextResponse.redirect(url) instead,
 * silently discarding the refreshed cookies — the browser would keep
 * stale tokens whenever a request happened to redirect, which can
 * desync the client/server session state and, if a refresh token was
 * rotated server-side in the process, break the session outright on the
 * next request.
 *
 * Fixed by capturing whatever setAll() is asked to write into a single
 * array once, then applying that exact same array onto whichever
 * response object this function ultimately returns — pass-through or
 * any redirect — via one shared helper (applyCookies). There is now
 * exactly one place cookies get attached to a response, used by every
 * exit path without exception.
 */
export async function updateSession(request: NextRequest) {
  const pendingCookies: PendingCookie[] = [];

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mirror onto the incoming request too, so anything later in
          // THIS same invocation that reads cookies via getAll() (e.g. a
          // subsequent Supabase call) sees the refreshed values.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          pendingCookies.push(...cookiesToSet);
        },
      },
    }
  );

  function applyCookies(res: NextResponse): NextResponse {
    for (const { name, value, options } of pendingCookies) {
      res.cookies.set(name, value, options as CookieOptions);
    }
    return res;
  }

  function passThrough(): NextResponse {
    return applyCookies(NextResponse.next({ request }));
  }

  function redirectTo(url: URL): NextResponse {
    return applyCookies(NextResponse.redirect(url));
  }

  let userId: string | null = null;
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    userId = claimsData?.claims?.sub ?? null;
  } catch {
    // Fail closed: treat any unexpected error verifying the session as
    // "not signed in" rather than letting it crash the request with a 500.
    userId = null;
  }
if (request.method !== "GET" && request.method !== "HEAD") {
  return passThrough();
}
  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isAdminLoginRoute = pathname === "/admin/login";
  const isAdminRoute = pathname.startsWith("/admin") && !isAdminLoginRoute;
  const isBuyerAuthRoute = pathname === "/login" || pathname === "/register";

  // Not signed in at all — block dashboard/admin, let everything else
  // (including /admin/login and /login/register themselves) through.
  if (!userId) {
    if (isDashboardRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return redirectTo(url);
    }
    if (isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return redirectTo(url);
    }
    return passThrough();
  }

  // Signed in and looking at the buyer login/register pages — nothing
  // more to do there.
  if (isBuyerAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectTo(url);
  }

  // Signed in and requesting an /admin/* page (not /admin/login itself):
  // must have an admin_users row. This is a real database round trip —
  // unavoidable here, since admin status has no representation in the JWT
  // (no custom claims hook is configured) and admin_users is the actual
  // source of truth per Module 2's schema. Reads the caller's OWN row
  // only, which the "admins can view own record" RLS policy permits.
  //
  // Fails CLOSED: a query error is treated as "not an admin" (redirect
  // away), never as "assume admin" — an admin check must never fail open.
  if (isAdminRoute) {
    let isAdmin = false;
    try {
      const { data: adminRow, error } = await supabase
        .from("admin_users")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      isAdmin = !error && !!adminRow;
    } catch {
      isAdmin = false;
    }

    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return redirectTo(url);
    }
  }

  // Signed in and already an admin, but looking at /admin/login — send
  // them straight to the admin home instead.
  if (isAdminLoginRoute) {
    let isAdmin = false;
    try {
      const { data: adminRow, error } = await supabase
        .from("admin_users")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      isAdmin = !error && !!adminRow;
    } catch {
      isAdmin = false;
    }

    if (isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return redirectTo(url);
    }
  }

  return passThrough();
}
