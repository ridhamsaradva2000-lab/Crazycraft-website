import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hmacIdentifier } from "@/lib/newsletter/hmac";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";

export async function checkPreVerificationRateLimit(visitorId: string, ip: string | null): Promise<boolean> {
  const admin = createAdminClient();
  const visitorHash = hmacIdentifier(visitorId);

  const rpcArgs: { p_visitor_hash: string; p_ip_hash?: string } = {
    p_visitor_hash: visitorHash,
    ...(ip ? { p_ip_hash: hmacIdentifier(ip) } : {}),
  };

  const { data, error } = await admin.rpc("check_and_record_newsletter_pre_verification_limit", rpcArgs);
  if (error) {
    logSafeDiagnostic("checkPreVerificationRateLimit", error);
    return false;
  }
  return data === true;
}