import { NextRequest, NextResponse } from "next/server";
import { rawConfirmationTokenSchema } from "@/lib/newsletter/tokens";
import {
  CONFIRMATION_COOKIE_NAME,
  confirmationCookieSetOptions,
  confirmationCookieClearOptions,
} from "@/lib/newsletter/confirmationContext";

export async function GET(request: NextRequest) {
  const tokenParsed = rawConfirmationTokenSchema.safeParse(request.nextUrl.searchParams.get("token"));

  const destination = new URL("/newsletter/confirm", request.nextUrl.origin);
  const response = NextResponse.redirect(destination, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");

  response.cookies.set(CONFIRMATION_COOKIE_NAME, "", confirmationCookieClearOptions());

  if (tokenParsed.success) {
    response.cookies.set(CONFIRMATION_COOKIE_NAME, tokenParsed.data, confirmationCookieSetOptions());
  }

  return response;
}