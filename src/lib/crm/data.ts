import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AdminUserOption {
  id: string;
  fullName: string;
  role: string;
}

export interface AdminUsersResult {
  admins: AdminUserOption[];
  /**
   * true only for a genuine query/permission failure — never set for
   * "the RPC succeeded and returned zero rows" (which is itself a valid,
   * if unusual, outcome: a brand-new project with no other staff yet).
   * Callers must check this before rendering an assignment dropdown as
   * if it were simply empty.
   */
  error: boolean;
}

/**
 * List of admins for CRM assignment dropdowns. Calls
 * list_crm_assignment_admins() — a SECURITY DEFINER RPC (Module 5
 * migration) — rather than querying admin_users or any view built on
 * top of it. This is the only mechanism that actually restricts
 * exposure to exactly id/full_name/role: RLS is a row-level tool, and an
 * ordinary admin_users SELECT grant (which `authenticated` already has,
 * from Module 2) combined with any row-permitting policy would let a
 * caller simply query admin_users directly regardless of what a view
 * "intended" to expose. The RPC's own RETURNS clause is what genuinely
 * limits the shape here, and its own internal has_admin_role('sales')
 * check — not any admin_users RLS policy — is what limits who can call
 * it at all.
 */
export async function listAdminUsers(): Promise<AdminUsersResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_crm_assignment_admins");

  if (error) {
    console.error("list_crm_assignment_admins failed:", error.code);
    return { admins: [], error: true };
  }

  return {
    admins: (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name, role: row.role })),
    error: false,
  };
}

export interface ActivityLogEntry {
  id: string;
  eventType: string;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ActivityLogResult {
  entries: ActivityLogEntry[];
  /** true only for a genuine query failure, never for "no activity yet". */
  error: boolean;
  /**
   * true when the entries themselves loaded successfully but resolving
   * WHO authored them failed — a separate, lower-stakes problem from
   * `error`. The timeline itself is still genuinely valid and should
   * still be shown; only the "by <name>" attribution is affected. The UI
   * should show a small, generic warning and fall back to a neutral
   * label (e.g. "Staff member") rather than treating this the same as
   * the whole timeline failing to load.
   */
  actorNamesError: boolean;
}

/**
 * Timeline entries for a single lead/sample, newest first. Exactly one of
 * the three id params should be provided, matching lead_activity_log's
 * own "exactly one parent" constraint.
 */
export async function getActivityLog(params: {
  inquiryId?: string;
  quoteRequestId?: string;
  sampleId?: string;
}): Promise<ActivityLogResult> {
  const supabase = await createClient();
  let query = supabase
    .from("lead_activity_log")
    .select("id, event_type, note, created_by, created_at")
    .order("created_at", { ascending: false });

  if (params.inquiryId) query = query.eq("inquiry_id", params.inquiryId);
  else if (params.quoteRequestId) query = query.eq("quote_request_id", params.quoteRequestId);
  else if (params.sampleId) query = query.eq("sample_id", params.sampleId);
  else return { entries: [], error: false, actorNamesError: false };

  const { data, error } = await query;
  if (error) {
    console.error("getActivityLog query failed:", error.code);
    return { entries: [], error: true, actorNamesError: false };
  }

  // Resolve created_by names via the same assignment RPC used for the
  // dropdown — never admin_users directly. Name resolution failing is a
  // SEPARATE, non-fatal problem from the timeline query having
  // succeeded: the entries themselves are still genuinely valid, so
  // they're still returned — actorNamesError signals the UI to show a
  // small warning and use a neutral fallback, without discarding real
  // timeline data over a resolution-only failure.
  const adminIds = [...new Set(data.map((row) => row.created_by).filter((id): id is string => !!id))];
  const namesById = new Map<string, string>();
  let actorNamesError = false;

  if (adminIds.length > 0) {
    const { admins, error: adminsError } = await listAdminUsers();
    if (adminsError) {
      console.error("getActivityLog: actor-name resolution failed (timeline entries still returned)");
      actorNamesError = true;
    } else {
      for (const admin of admins) {
        if (adminIds.includes(admin.id)) namesById.set(admin.id, admin.fullName);
      }
    }
  }

  return {
    entries: data.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      note: row.note,
      createdBy: row.created_by,
      createdByName: row.created_by ? (namesById.get(row.created_by) ?? null) : null,
      createdAt: row.created_at,
    })),
    error: false,
    actorNamesError,
  };
}
