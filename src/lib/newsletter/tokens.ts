import "server-only";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";
import { clientEnv } from "@/lib/env.client";
import { z } from "zod";

const HEX64_PATTERN = /^[0-9a-f]{64}$/;
export const rawConfirmationTokenSchema = z.string().regex(HEX64_PATTERN);

export function generateConfirmationToken(): { rawToken: string; hash: string } {
  const rawToken = randomBytes(32).toString("hex");
  return { rawToken, hash: hashConfirmationToken(rawToken) };
}

export function hashConfirmationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateLifecycleNonce(): string {
  return randomBytes(32).toString("hex");
}

export function deriveUnsubscribeToken(subscriberId: string, lifecycleNonce: string): string {
  return createHmac("sha256", serverEnv.NEWSLETTER_TOKEN_SECRET)
    .update(`unsubscribe:v1:${subscriberId}:${lifecycleNonce}`)
    .digest("hex");
}

export function buildUnsubscribeUrl(subscriberId: string, lifecycleNonce: string): string {
  const token = deriveUnsubscribeToken(subscriberId, lifecycleNonce);
  const url = new URL("/newsletter/unsubscribe/start", clientEnv.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("id", subscriberId);
  url.searchParams.set("token", token);
  return url.toString();
}

export function constantTimeHexEqual(a: string, b: string): boolean {
  if (!HEX64_PATTERN.test(a) || !HEX64_PATTERN.test(b)) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}