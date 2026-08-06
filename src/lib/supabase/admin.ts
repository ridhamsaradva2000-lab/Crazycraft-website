import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env.server";
import { clientEnv } from "@/lib/env.client";
import type { Database } from "@/types/database.types";

/**
 * Privileged, secret-key-based Supabase client. Bypasses RLS entirely —
 * the underlying Postgres role (service_role) carries BYPASSRLS. This is
 * exactly the client Module 1/2 deferred creating "until the module that
 * first needs it" (see Module 1's src/lib/supabase/server.ts comment) —
 * that module is this one.
 *
 * Why it's needed now: submit_inquiry() must be callable ONLY by a
 * trusted server-side process, never directly by anon/authenticated
 * through the Data API — otherwise a caller with just the publishable
 * key could invoke it directly and skip Turnstile verification and
 * trusted server-side IP extraction entirely, since neither of those
 * checks can be expressed inside the database itself. Making the RPC
 * service_role-only (see the Module 4 grants migration) means the ONLY
 * way to call it is with this client, from server-only code.
 *
 * Uses createClient() directly from @supabase/supabase-js — not
 * @supabase/ssr's createServerClient — because this credential is not
 * tied to any particular browser session. It has no cookies to read or
 * write, so persistSession/autoRefreshToken/detectSessionInUrl are all
 * explicitly disabled: there is no session for this client to persist,
 * refresh, or detect in a URL, and leaving those on would be meaningless
 * overhead at best.
 *
 * NEVER import this into a Client Component. There is no runtime guard
 * that can stop that except the "server-only" package's build-time
 * error, which is why every file in this chain (this file, env.server.ts)
 * imports it.
 */
export function createAdminClient() {
  return createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
