"use server";

import { headers } from "next/headers";
import { isIP } from "node:net";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { clientEnv } from "@/lib/env.client";
import { serverEnv } from "@/lib/env.server";
import { inquiryFormSchema, type InquiryFormInput } from "@/lib/validations/inquiry";
import type { Database } from "@/types/database.types";

export interface SubmitInquiryResult {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

/**
 * The real generated Args type for submit_inquiry(). Supabase's type
 * generator exposes each RPC parameter's base scalar type but does not
 * reliably infer `| null` for parameters the underlying SQL function
 * accepts null for (this is a known generator limitation, not a
 * reflection of the actual database contract — the migration's own
 * plpgsql body explicitly handles null for every one of these
 * parameters). GeneratedSubmitInquiryArgs is exactly what the generator
 * produced; it is not edited here.
 */
type GeneratedSubmitInquiryArgs = Database["public"]["Functions"]["submit_inquiry"]["Args"];

/**
 * The complete, exact set of submit_inquiry() parameters that are
 * genuinely nullable at the database level — cross-checked against
 * 20260726090300_target_market_country_scoring.sql's actual signature
 * and body. Every other parameter (p_name, p_email, p_country,
 * p_business_type, p_message, p_private_label_required, p_wants_sample,
 * p_honeypot) is required and must never be passed as null.
 */
type NullableSubmitInquiryArg =
  | "p_product_id"
  | "p_company_name"
  | "p_company_website"
  | "p_linkedin_url"
  | "p_volume_range"
  | "p_moq_familiarity"
  | "p_timeline"
  | "p_shipping_country"
  | "p_incoterm_preference"
  | "p_visitor_id"
  | "p_client_ip"
  | "p_utm_source"
  | "p_utm_medium"
  | "p_utm_campaign"
  | "p_referrer"
  | "p_landing_page"
  | "p_first_touch_source"
  | "p_first_touch_medium"
  | "p_first_touch_campaign"
  | "p_last_touch_source"
  | "p_last_touch_medium"
  | "p_last_touch_campaign"
  | "p_fbp"
  | "p_fbc"
  | "p_event_id";

/**
 * The precise local compatibility type used to build the actual call
 * arguments below. Starts from the real generated type (so every one of
 * the 33 keys is still checked against it — a typo'd or missing key
 * fails to compile) and widens ONLY the genuinely-nullable subset to
 * `| null`. Every required key keeps the generated type's exact
 * (non-null) type, so passing null for a required parameter is still a
 * compile error here, same as it would be against the generated type
 * directly.
 */
type SubmitInquiryRpcArgs = Omit<GeneratedSubmitInquiryArgs, NullableSubmitInquiryArg> & {
  [K in NullableSubmitInquiryArg]: GeneratedSubmitInquiryArgs[K] | null;
};

/**
 * Runtime validation for submit_inquiry()'s JSONB return value — this
 * replaces an unchecked `as` cast. The RPC's actual return shape (see the
 * migration) is always one of these four statuses, with inquiry_id only
 * present for accepted/duplicate and message only present for
 * rejected/absent otherwise; both are optional here to match that
 * precisely rather than assuming either is always present.
 */
const submitInquiryRpcResultSchema = z.object({
  status: z.enum(["accepted", "duplicate", "rate_limited", "rejected"]),
  inquiry_id: z.string().uuid().optional(),
  message: z.string().optional(),
});

/**
 * Extracts the caller's IP — but ONLY from a header the deployer has
 * explicitly configured as trustworthy for their specific infrastructure
 * (TRUSTED_CLIENT_IP_HEADER). Returns null if none is configured.
 *
 * WHY NOT JUST TRUST x-forwarded-for BY DEFAULT — the previous revision
 * of this function did, guarded only by node:net's isIP(). That guard is
 * necessary but not sufficient: isIP() proves a string is well-formed
 * syntax for an IPv4/IPv6 address, not that it was supplied by trusted
 * infrastructure rather than the client itself. x-forwarded-for is an
 * ordinary request header — per the X-Forwarded-For convention (see
 * RFC 7239 and the de-facto standard it formalizes), each hop APPENDS
 * its own observed address rather than replacing the header outright, so
 * a client that connects directly with its own
 * "X-Forwarded-For: 1.2.3.4" already present will, after passing through
 * exactly one real proxy, produce a header like "1.2.3.4, <real-proxy-
 * observed-ip>" — the FIRST entry (what the earlier version of this
 * function returned) is the attacker's own unverifiable claim, and the
 * LAST entry is the one actually trustworthy, if any single hop can be
 * trusted at all. Whether that's even the correct entry to use, and
 * whether x-forwarded-for is safe to consult at all, depends entirely on
 * the SPECIFIC deployment topology in front of this app — how many
 * proxy hops there are, and whether each one can be trusted to have
 * appended rather than passed through a spoofed value unmodified. This
 * function cannot know that in the abstract, and asserting a specific
 * platform's behavior without having verified it directly would be
 * exactly the "well-formed is not the same as trusted" mistake this
 * fix exists to correct.
 *
 * THE ACTUAL CONTRACT: set TRUSTED_CLIENT_IP_HEADER to the name of
 * whichever single header YOUR verified infrastructure guarantees
 * reflects the genuine client IP and cannot be forged by the client —
 * for example (verify against your own provider's current documentation
 * before configuring; this is not asserted as fact for any of them):
 *   - A platform-specific single-IP header your provider documents as
 *     edge-set and non-passthrough (not merely "commonly used for this
 *     purpose", but explicitly documented as overwritten/guaranteed).
 *   - A CDN/WAF-specific header (e.g. the connecting-IP style header a
 *     provider like Cloudflare sets when placed in front of the app) —
 *     only if that CDN is confirmed to be the sole edge in front of this
 *     app, with no other hop able to inject a value before it.
 *
 * THE CONFIGURED HEADER MUST CONTAIN EXACTLY ONE IP — never an
 * X-Forwarded-For-style comma-separated chain. An earlier revision of
 * this function tried to handle both by taking the chain's LAST entry,
 * reasoning that's the value the closest/most-trusted hop appended. That
 * assumption isn't safe as a GENERIC contract: without an explicitly
 * configured trusted-proxy-hop count, this function has no way to know
 * the last entry is actually the edge's own observation rather than
 * another intermediate proxy's — trusting an inferred position in an
 * unfamiliar chain could return a shared proxy IP instead of the real
 * client's, silently merging unrelated buyers under one rate-limit
 * identity. If your configured header ever contains a comma, that's a
 * sign the header itself is the wrong choice for this contract (or is
 * genuinely misconfigured) — this function fails closed (returns null)
 * rather than guessing which position to trust.
 *
 * If TRUSTED_CLIENT_IP_HEADER is not set, the configured header is
 * absent, contains more than one value, or doesn't hold a syntactically
 * valid address, this returns null. submit_inquiry() treats a null
 * client_ip as "skip the per-IP rate-limit check" — visitor_id and
 * per-email limits still apply in full, so this is a safe default, not a
 * silent gap in coverage.
 */
async function getClientIp(): Promise<string | null> {
  const headerName = serverEnv.TRUSTED_CLIENT_IP_HEADER;
  if (!headerName) {
    return null;
  }

  const headersList = await headers();
  const value = headersList.get(headerName);
  if (!value) return null;

  const trimmed = value.trim();

  // The configured header must be a single edge-verified IP, never a
  // chain — see the extended comment above for why inferring a position
  // in an unfamiliar chain isn't a safe generic contract. A comma here
  // means either genuine misconfiguration or the wrong header was
  // chosen; either way, fail closed rather than guess.
  if (trimmed.includes(",")) {
    return null;
  }

  return isIP(trimmed) !== 0 ? trimmed : null;
}

function expectedHostname(): string | undefined {
  // Local development mein Turnstile test key dummy hostname deti hai.
  // Production mein hostname security check active rahega.
  if (process.env.NODE_ENV !== "production") {
    return undefined;
  }

  try {
    return new URL(clientEnv.NEXT_PUBLIC_SITE_URL).hostname;
  } catch {
    return undefined;
  }
}

/**
 * The only server-side entry point for creating an inquiry from the
 * public form.
 *
 * Security boundary: submit_inquiry() is service_role-only (see the
 * Module 4 grants) — it is not reachable by anon/authenticated through
 * the Data API at all, only from this trusted server code holding the
 * secret key. This is deliberate: the publishable key alone must never
 * be sufficient to invoke it, since doing so would skip the two checks
 * below that only THIS server-side code can perform — Turnstile
 * verification and trusted IP extraction from real request headers.
 *
 * Never calls a direct .from("inquiries").insert() either — that path is
 * revoked entirely for anon/authenticated as of this module.
 */
export async function submitInquiryAction(input: InquiryFormInput): Promise<SubmitInquiryResult> {
  const parsed = inquiryFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in fieldErrors)) {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "Please check the form for errors.", fieldErrors };
  }

  const data = parsed.data;

  // Honeypot: if a bot filled the hidden field, pretend success and do
  // nothing further — never respond differently for a caught bot than
  // for a real submission, or the difference itself becomes a signal an
  // adversary can probe for. (submit_inquiry() also has its own honeypot
  // check, in case this action is ever called with the field populated
  // by something other than this exact client code — defense in depth,
  // not a reason to skip the RPC's own check.)
  if (data.honeypot && data.honeypot.trim().length > 0) {
    return { error: null, success: true };
  }

  const clientIp = await getClientIp();

  const turnstileResult = await verifyTurnstileToken(data.turnstileToken, {
    remoteIp: clientIp ?? undefined,
    expectedHostname: expectedHostname(),
    expectedAction:
  process.env.NODE_ENV === "production"
    ? clientEnv.NEXT_PUBLIC_TURNSTILE_ACTION
    : undefined,
  });

  if (!turnstileResult.success) {
  console.error(
    "Turnstile verification failed:",
    turnstileResult.errorCodes,
  );

  return {
    error: "We couldn't verify you're human. Please refresh and try again.",
  };
}

  // Only reachable past this point with a verified Turnstile token and a
  // trusted, server-extracted IP — exactly the two things a direct
  // publishable-key caller could never provide, which is why this call
  // uses the privileged admin client rather than the ordinary
  // cookie-scoped one.
  const adminClient = createAdminClient();

  // Checked against SubmitInquiryRpcArgs — the precise compatibility type
  // above — not the raw generated type. This is what actually catches a
  // mistake (a required field accidentally set to null, a typo'd key, a
  // missing parameter): TypeScript still enforces the exact 33-key shape
  // and every required field's non-null type here, same as it would
  // against the generated type directly.
  const rpcArgs: SubmitInquiryRpcArgs = {
    p_product_id: data.productId ?? null,
    p_name: data.name,
    p_email: data.email,
    p_country: data.country,
    p_business_type: data.businessType,
    p_message: data.message,
    p_company_name: data.companyName || null,
    p_company_website: data.companyWebsite || null,
    p_linkedin_url: data.linkedinUrl || null,
    p_volume_range: data.volumeRange || null,
    p_moq_familiarity: data.moqFamiliarity ?? null,
    p_timeline: data.timeline ?? null,
    p_shipping_country: data.shippingCountry || null,
    p_incoterm_preference: data.incotermPreference ?? null,
    p_private_label_required: data.privateLabelRequired ?? false,
    p_wants_sample: data.wantsSample ?? false,
    p_visitor_id: data.visitorId || null,
    p_client_ip: clientIp,
    p_utm_source: data.utmSource || null,
    p_utm_medium: data.utmMedium || null,
    p_utm_campaign: data.utmCampaign || null,
    p_referrer: data.referrer || null,
    p_landing_page: data.landingPage || null,
    p_first_touch_source: data.firstTouchSource || null,
    p_first_touch_medium: data.firstTouchMedium || null,
    p_first_touch_campaign: data.firstTouchCampaign || null,
    p_last_touch_source: data.lastTouchSource || null,
    p_last_touch_medium: data.lastTouchMedium || null,
    p_last_touch_campaign: data.lastTouchCampaign || null,
    p_fbp: data.fbp || null,
    p_fbc: data.fbc || null,
    p_event_id: data.eventId ?? null,
    // Already handled above (the early return on a filled honeypot) —
    // this is never forwarded as actually filled. "" rather than null
    // specifically because p_honeypot is not in the nullable set above;
    // the RPC's own check (`length(trim(p_honeypot)) > 0`) treats an
    // empty string identically to null — both fail to trigger rejection.
    p_honeypot: "",
  };

  const { data: result, error } = await adminClient.rpc(
    "submit_inquiry",
    // The one, single, documented compatibility cast at the generated-
    // type boundary: PostgreSQL accepts null at runtime for every key in
    // NullableSubmitInquiryArg (the migration's own body handles null
    // checks explicitly for each), but the generated Args metadata only
    // exposes their base scalar types. rpcArgs was already checked
    // against the precise SubmitInquiryRpcArgs type above — this cast
    // exists solely to satisfy .rpc()'s parameter type, which is pinned
    // to the generated (imprecise) type; it does not re-open any of the
    // checking that already happened when rpcArgs was constructed.
    rpcArgs as unknown as GeneratedSubmitInquiryArgs
  );

  if (error) {
    // A genuine error here means something unexpected happened — every
    // EXPECTED business outcome (rate limited, duplicate, rejected) comes
    // back as a structured result below, not an error. Never surface
    // error.message directly — it can contain table/column/constraint
    // names or other schema internals.
    console.error("submit_inquiry RPC failed unexpectedly:", error);
    return { error: "Something went wrong submitting your inquiry. Please try again." };
  }

  const parsedResult = submitInquiryRpcResultSchema.safeParse(result);

  if (!parsedResult.success) {
    // The RPC's actual shape didn't match what this code expects — log
    // only the structured Zod issues (never the raw result, which could
    // in principle contain unexpected data) and stop here rather than
    // falling through to a switch statement built for a shape we can't
    // actually confirm we received.
    console.error("submit_inquiry returned an unexpected shape:", parsedResult.error.issues);
    return { error: "Something went wrong submitting your inquiry. Please try again." };
  }

  const rpcResult = parsedResult.data;

  switch (rpcResult.status) {
    case "accepted":
    case "duplicate":
      return { error: null, success: true };
    case "rate_limited":
      return {
        error: "You've submitted a few times recently — please wait a few minutes and try again.",
      };
    case "rejected":
      // rpcResult.message is an internal-facing reason (e.g. "invalid or
      // unpublished product") — safe to log, not necessarily phrased for
      // an end user, so it's logged server-side and a generic message is
      // shown instead of surfacing it directly.
      console.error("submit_inquiry rejected:", rpcResult.message);
      return { error: "Please check the form for errors and try again." };
    default:
      return { error: "Something went wrong submitting your inquiry. Please try again." };
  }
}
