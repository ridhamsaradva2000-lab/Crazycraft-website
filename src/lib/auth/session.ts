import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type AdminRole = Database["public"]["Enums"]["admin_role"];

export interface AdminProfile {
  id: string;
  fullName: string;
  role: AdminRole;
}

export interface BuyerProfile {
  id: string;
  companyName: string;
  businessType: string;
  country: string;
  phone: string | null;
  website: string | null;
  verified: boolean;
}

/**
 * Cached per-request (React's cache()) so calling this multiple times
 * across nested Server Components in the same render doesn't issue
 * multiple auth round trips.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Returns the caller's admin_users row, or null if they don't have one.
 * Reads their OWN row only — exactly what the "admins can view own
 * record" RLS policy from Module 2 permits, so this works for any
 * logged-in user without needing a privileged client.
 */
export const getAdminProfile = cache(async (): Promise<AdminProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  return { id: data.id, fullName: data.full_name, role: data.role };
});

/**
 * Returns the caller's buyers row, or null if they don't have one.
 */
export const getBuyerProfile = cache(async (): Promise<BuyerProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyers")
    .select("id, company_name, business_type, country, phone, website, verified")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    companyName: data.company_name,
    businessType: data.business_type,
    country: data.country,
    phone: data.phone,
    website: data.website,
    verified: data.verified,
  };
});

/**
 * True if the caller has an admin_users row matching the given role, or
 * is super_admin (super_admin is treated as a superset everywhere else in
 * this project — see private.has_admin_role() in Module 2 — so this
 * mirrors that same rule at the app layer for consistency).
 */
export async function hasAdminRole(role: AdminRole): Promise<boolean> {
  const profile = await getAdminProfile();
  if (!profile) return false;
  return profile.role === role || profile.role === "super_admin";
}
