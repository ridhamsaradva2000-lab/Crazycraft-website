import "server-only";
import { createClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env.client";
import type { Database } from "@/types/database.types";

export function createPublicCatalogClient() {
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