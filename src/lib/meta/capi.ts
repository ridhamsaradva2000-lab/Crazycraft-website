import "server-only";

import { createHash } from "node:crypto";
import { clientEnv } from "@/lib/env.client";
import { serverEnv } from "@/lib/env.server";
import { isValidMetaPixelId } from "@/lib/meta/pixel-config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database.types";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 10;
const MAX_BATCH_LIMIT = 25;
const FETCH_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60] as const;

type CapiEventRow = Database["public"]["Tables"]["capi_events"]["Row"];

export interface CapiDeliverySummary {
  configured: boolean;
  candidates: number;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

function retryDelaySeconds(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_SECONDS.length - 1);
  return RETRY_DELAYS_SECONDS[index]!;
}

function nextRetryAt(attempts: number): string {
  return new Date(Date.now() + retryDelaySeconds(attempts) * 1000).toISOString();
}

function eventSourceUrl(landingPage: string | null): string {
  try {
    return new URL(landingPage || "/", clientEnv.NEXT_PUBLIC_SITE_URL).toString();
  } catch {
    return clientEnv.NEXT_PUBLIC_SITE_URL;
  }
}

function sanitizeMetaResponse(value: unknown): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, Json> = {};

  if (typeof input.events_received === "number") output.events_received = input.events_received;
  if (typeof input.fbtrace_id === "string") output.fbtrace_id = input.fbtrace_id.slice(0, 255);

  if (typeof input.error === "object" && input.error !== null && !Array.isArray(input.error)) {
    const errorInput = input.error as Record<string, unknown>;
    const safeError: Record<string, Json> = {};
    if (typeof errorInput.message === "string") safeError.message = errorInput.message.slice(0, 500);
    if (typeof errorInput.type === "string") safeError.type = errorInput.type.slice(0, 100);
    if (typeof errorInput.code === "number") safeError.code = errorInput.code;
    if (typeof errorInput.error_subcode === "number") safeError.error_subcode = errorInput.error_subcode;
    if (typeof errorInput.fbtrace_id === "string") safeError.fbtrace_id = errorInput.fbtrace_id.slice(0, 255);
    output.error = safeError;
  }

  return output;
}

async function writeDeliveryLog(
  adminClient: ReturnType<typeof createAdminClient>,
  capiEventId: string,
  responseStatus: number | null,
  responseBody: Json
) {
  const { error } = await adminClient.from("capi_event_log").insert({
    capi_event_id: capiEventId,
    response_status: responseStatus,
    response_body: responseBody,
  });

  if (error) {
    console.error("CAPI delivery log insert failed:", { capiEventId, code: error.code });
  }
}

async function markFailed(
  adminClient: ReturnType<typeof createAdminClient>,
  event: CapiEventRow,
  errorCode: string
) {
  const { error } = await adminClient
    .from("capi_events")
    .update({
      status: "failed",
      last_error: errorCode.slice(0, 500),
      next_attempt_at: nextRetryAt(event.attempts),
      processing_started_at: null,
    })
    .eq("id", event.id);

  if (error) {
    console.error("CAPI event failure-state update failed:", {
      capiEventId: event.id,
      code: error.code,
    });
  }
}

async function markSent(adminClient: ReturnType<typeof createAdminClient>, event: CapiEventRow) {
  const { error } = await adminClient
    .from("capi_events")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      last_error: null,
      processing_started_at: null,
    })
    .eq("id", event.id);

  if (error) {
    throw new Error(`CAPI sent-state update failed for ${event.id}: ${error.code}`);
  }
}

async function claimEvent(
  adminClient: ReturnType<typeof createAdminClient>,
  candidate: CapiEventRow,
  nowIso: string,
  leaseCutoffIso: string
): Promise<CapiEventRow | null> {
  const { data, error } = await adminClient
    .from("capi_events")
    .update({
      attempts: candidate.attempts + 1,
      processing_started_at: nowIso,
      last_error: null,
    })
    .eq("id", candidate.id)
    .eq("attempts", candidate.attempts)
    .eq("status", candidate.status)
    .lte("next_attempt_at", nowIso)
    .or(`processing_started_at.is.null,processing_started_at.lt.${leaseCutoffIso}`)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("CAPI event claim failed:", { capiEventId: candidate.id, code: error.code });
    return null;
  }

  return data;
}

async function deliverClaimedEvent(
  adminClient: ReturnType<typeof createAdminClient>,
  event: CapiEventRow,
  pixelId: string,
  accessToken: string
): Promise<boolean> {
  if (!event.inquiry_id || event.event_name !== "Lead") {
    await writeDeliveryLog(adminClient, event.id, null, { error: "unsupported_event_shape" });
    await markFailed(adminClient, event, "unsupported_event_shape");
    return false;
  }

  const { data: inquiry, error: inquiryError } = await adminClient
    .from("inquiries")
    .select("email, fbp, fbc, landing_page, created_at")
    .eq("id", event.inquiry_id)
    .single();

  if (inquiryError || !inquiry) {
    await writeDeliveryLog(adminClient, event.id, null, { error: "inquiry_lookup_failed" });
    await markFailed(adminClient, event, "inquiry_lookup_failed");
    return false;
  }

  const eventTimeMs = Date.parse(inquiry.created_at);
  if (!Number.isFinite(eventTimeMs)) {
    await writeDeliveryLog(adminClient, event.id, null, { error: "invalid_event_time" });
    await markFailed(adminClient, event, "invalid_event_time");
    return false;
  }

  const userData: Record<string, unknown> = {
    em: [sha256(inquiry.email)],
  };
  if (inquiry.fbp) userData.fbp = inquiry.fbp;
  if (inquiry.fbc) userData.fbc = inquiry.fbc;

  const data = {
    event_name: event.event_name,
    event_time: Math.floor(eventTimeMs / 1000),
    event_id: event.event_id,
    action_source: "website",
    event_source_url: eventSourceUrl(inquiry.landing_page),
    user_data: userData,
  };

  const body: Record<string, unknown> = { data: [data] };
  if (serverEnv.META_TEST_EVENT_CODE) body.test_event_code = serverEnv.META_TEST_EVENT_CODE;

  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${serverEnv.META_GRAPH_API_VERSION}/${pixelId}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
  } catch {
    await writeDeliveryLog(adminClient, event.id, null, { error: "network_error" });
    await markFailed(adminClient, event, "network_error");
    return false;
  }

  let responseJson: unknown = null;
  try {
    responseJson = await response.json();
  } catch {
    responseJson = null;
  }

  await writeDeliveryLog(adminClient, event.id, response.status, sanitizeMetaResponse(responseJson));

  if (!response.ok) {
    await markFailed(adminClient, event, `meta_http_${response.status}`);
    return false;
  }

  await markSent(adminClient, event);
  return true;
}

export async function deliverPendingCapiEvents(options?: {
  limit?: number;
}): Promise<CapiDeliverySummary> {
  const accessToken = serverEnv.META_CONVERSIONS_API_TOKEN;
  const pixelId = clientEnv.NEXT_PUBLIC_META_PIXEL_ID;

  if (!accessToken || !isValidMetaPixelId(pixelId)) {
    return { configured: false, candidates: 0, claimed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const limit = Math.min(
    Math.max(Math.trunc(options?.limit ?? DEFAULT_BATCH_LIMIT), 1),
    MAX_BATCH_LIMIT
  );

  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();
  const leaseCutoffIso = new Date(Date.now() - LEASE_MS).toISOString();

  const { data, error } = await adminClient
    .from("capi_events")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .lte("next_attempt_at", nowIso)
    .or(`processing_started_at.is.null,processing_started_at.lt.${leaseCutoffIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`CAPI candidate query failed: ${error.code}`);

  const candidates = data ?? [];
  const summary: CapiDeliverySummary = {
    configured: true,
    candidates: candidates.length,
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    const claimed = await claimEvent(
      adminClient,
      candidate,
      new Date().toISOString(),
      leaseCutoffIso
    );

    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    summary.claimed += 1;

    try {
      const sent = await deliverClaimedEvent(adminClient, claimed, pixelId, accessToken);
      if (sent) summary.sent += 1;
      else summary.failed += 1;
    } catch (error) {
      console.error("CAPI delivery failed unexpectedly:", {
        capiEventId: claimed.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      await writeDeliveryLog(adminClient, claimed.id, null, { error: "unexpected_delivery_error" });
      await markFailed(adminClient, claimed, "unexpected_delivery_error");
      summary.failed += 1;
    }
  }

  return summary;
}
