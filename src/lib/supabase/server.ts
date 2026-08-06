import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clientEnv } from "@/lib/env.client";
import type { Database } from "@/types/database.types";

/**
 * Server client — for Server Components, Server Actions, and Route Handlers.
 * Uses the publishable key (not the secret key) and respects RLS exactly
 * like the browser client. A privileged, secret-key-based client is
 * intentionally not created here — it's built only in the module that
 * first needs to bypass RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options as CookieOptions);
            });
          } catch {
            // Called from a Server Component — safe to ignore; proxy.ts
            // refreshes the session for the routes that need it.
          }
        },
      },
    }
  );
}
