import "server-only";
import { z } from "zod";

export const UNSUBSCRIBE_COOKIE_NAME = "cc_nl_unsub_ctx";
export const UNSUBSCRIBE_COOKIE_PATH = "/newsletter/unsubscribe";
export const UNSUBSCRIBE_COOKIE_MAX_AGE_SECONDS = 60 * 10;

const idSchema = z.string().uuid();
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export interface UnsubscribeContext {
  id: string;
  token: string;
}

export function parseUnsubscribeCookie(raw: string | undefined): UnsubscribeContext | null {
  if (!raw) return null;
  const [id, token] = raw.split(":");
  const idParsed = idSchema.safeParse(id);
  const tokenParsed = tokenSchema.safeParse(token);
  if (!idParsed.success || !tokenParsed.success) return null;
  return { id: idParsed.data, token: tokenParsed.data };
}

export function encodeUnsubscribeCookie(id: string, token: string): string {
  return `${id}:${token}`;
}

function baseOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: UNSUBSCRIBE_COOKIE_PATH,
  };
}

export function unsubscribeCookieSetOptions() {
  return { ...baseOptions(), maxAge: UNSUBSCRIBE_COOKIE_MAX_AGE_SECONDS };
}

export function unsubscribeCookieClearOptions() {
  return { ...baseOptions(), maxAge: 0 };
}