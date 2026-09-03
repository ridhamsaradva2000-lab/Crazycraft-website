import "server-only";
import { createClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env.client";
import type { Database } from "@/types/database.types";

/**
 * Anonymous, cookie-free, session-free Supabase client used ONLY for
 * sitemap.xml generation. Built directly with the standard Supabase JS
 * client rather than the request-cookie-aware server client used
 * elsewhere in this project, and configured with NO cookie adapter at
 * all, so it never reads or attaches any inbound request's auth cookies
 * and never carries any caller's session -- RLS therefore always
 * evaluates every sitemap read as the anon role, uniformly, regardless
 * of who or what actually requested /sitemap.xml. Uses the publishable
 * key only (never the secret/service-role key); RLS remains fully
 * authoritative. There is no session to persist/refresh/detect for a
 * stateless per-request read either way, so all three auth options
 * below are explicitly disabled.
 */
export function createSitemapClient() {
  return createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}