import "server-only";
import { serverEnv } from "@/lib/env.server";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes: string[];
}

interface TurnstileApiResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
  cdata?: string;
}

function isTurnstileApiResponse(value: unknown): value is TurnstileApiResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    typeof (value as { success: unknown }).success === "boolean"
  );
}

/**
 * Verifies a Cloudflare Turnstile token against the official siteverify
 * endpoint. Every non-happy-path outcome — timeout, network failure,
 * malformed/unexpected response shape, a hostname mismatch, an action
 * mismatch — returns success: false. There is no code path where an
 * exception or unexpected response is treated as a pass; failing closed
 * is the whole point of this check existing at all.
 *
 * TURNSTILE_SECRET_KEY is read from serverEnv (server-only import chain:
 * this file has no "use client", imports only from env.server.ts) and
 * never appears in any client-bundled code.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  options?: { remoteIp?: string; expectedHostname?: string; expectedAction?: string }
): Promise<TurnstileVerifyResult> {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const body = new URLSearchParams();
    body.set("secret", serverEnv.TURNSTILE_SECRET_KEY);
    body.set("response", token);
    if (options?.remoteIp) {
      body.set("remoteip", options.remoteIp);
    }

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      return { success: false, errorCodes: [`http-${res.status}`] };
    }

    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      return { success: false, errorCodes: ["malformed-response"] };
    }

    if (!isTurnstileApiResponse(raw)) {
      return { success: false, errorCodes: ["malformed-response"] };
    }

    if (!raw.success) {
      return { success: false, errorCodes: raw["error-codes"] ?? ["unknown"] };
    }

    // Hostname verification where practical: Cloudflare returns the
    // hostname the widget was actually rendered on. If we know what to
    // expect, this fails closed on BOTH a mismatch AND a missing
    // hostname in the response — an earlier version only checked for a
    // mismatch, which meant a response that omitted hostname entirely
    // silently passed instead of being rejected. Not enforced at all if
    // we don't have an expected hostname to compare against (e.g. a
    // misconfigured NEXT_PUBLIC_SITE_URL).
    if (options?.expectedHostname) {
     if (raw.hostname !== options.expectedHostname) {
  console.error("Turnstile hostname mismatch:", {
    expected: options.expectedHostname,
    received: raw.hostname,
  });

  return { success: false, errorCodes: ["hostname-mismatch"] };
}
    }

    // Action verification: Cloudflare reflects back whatever `action`
    // the widget was rendered with (see TurnstileWidget's own comment).
    // Checking it here — failing closed on both missing and mismatched,
    // same as hostname above — is what stops a token issued for a
    // DIFFERENT Turnstile widget on the same host from being replayed
    // against this form. Hostname alone can't catch that: two widgets on
    // the same page/site share a hostname but can be given different
    // actions specifically to distinguish them.
    if (options?.expectedAction) {
      if (!raw.action) {
        return { success: false, errorCodes: ["missing-action"] };
      }
      if (raw.action !== options.expectedAction) {
        return { success: false, errorCodes: ["action-mismatch"] };
      }
    }

    return { success: true, errorCodes: [] };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return { success: false, errorCodes: [isTimeout ? "timeout" : "network-error"] };
  } finally {
    clearTimeout(timeoutId);
  }
}
