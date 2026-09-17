import "server-only";
import { rawConfirmationTokenSchema } from "@/lib/newsletter/tokens";

export const CONFIRMATION_COOKIE_NAME = "cc_nl_confirm_token";
export const CONFIRMATION_COOKIE_PATH = "/newsletter/confirm";
export const CONFIRMATION_COOKIE_MAX_AGE_SECONDS = 60 * 10;

function baseOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: CONFIRMATION_COOKIE_PATH,
  };
}

export function parseConfirmationCookie(raw: string | undefined): string | null {
  const parsed = rawConfirmationTokenSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function confirmationCookieSetOptions() {
  return { ...baseOptions(), maxAge: CONFIRMATION_COOKIE_MAX_AGE_SECONDS };
}

export function confirmationCookieClearOptions() {
  return { ...baseOptions(), maxAge: 0 };
}