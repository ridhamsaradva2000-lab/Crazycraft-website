import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

export function hmacIdentifier(value: string): string {
  return createHmac("sha256", serverEnv.RATE_LIMIT_HMAC_SECRET).update(value).digest("hex");
}