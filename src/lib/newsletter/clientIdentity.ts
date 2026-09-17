import "server-only";
import { cookies, headers } from "next/headers";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { serverEnv } from "@/lib/env.server";

const VISITOR_COOKIE_NAME = "cc_nl_visitor";
const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 48; // 48h
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const VISITOR_COOKIE_DOMAIN_PREFIX = "newsletter-visitor-cookie:v1:";

export async function newsletterClientIp(): Promise<string | null> {
  const headerName = serverEnv.TRUSTED_CLIENT_IP_HEADER;
  if (!headerName) return null;

  const headerStore = await headers();
  const rawValue = headerStore.get(headerName);
  if (!rawValue) return null;
  if (rawValue.includes(",")) return null;

  const trimmed = rawValue.trim();
  if (!isIP(trimmed)) return null;
  return trimmed;
}

function signVisitorId(uuid: string): string {
  return createHmac("sha256", serverEnv.RATE_LIMIT_HMAC_SECRET)
    .update(VISITOR_COOKIE_DOMAIN_PREFIX + uuid)
    .digest("hex");
}

function verifySignedVisitorCookie(raw: string): string | null {
  const separatorIndex = raw.indexOf(".");
  if (separatorIndex < 0) return null;

  const uuid = raw.substring(0, separatorIndex);
  const signature = raw.substring(separatorIndex + 1);

  if (!UUID_PATTERN.test(uuid)) return null;
  if (!SIGNATURE_PATTERN.test(signature)) return null;

  const expectedSignature = signVisitorId(uuid);
  const suppliedBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (suppliedBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(suppliedBuf, expectedBuf)) return null;

  return uuid;
}

export async function getOrCreateVisitorCookie(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE_NAME);

  if (existing?.value) {
    const verifiedUuid = verifySignedVisitorCookie(existing.value);
    if (verifiedUuid) return verifiedUuid;
  }

  const newId = randomUUID();
  const signature = signVisitorId(newId);
  cookieStore.set(VISITOR_COOKIE_NAME, `${newId}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return newId;
}