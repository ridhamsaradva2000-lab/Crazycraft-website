import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  UNSUBSCRIBE_COOKIE_NAME,
  encodeUnsubscribeCookie,
  unsubscribeCookieSetOptions,
  unsubscribeCookieClearOptions,
} from "@/lib/newsletter/unsubscribeContext";

const idSchema = z.string().uuid();
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export async function GET(request: NextRequest) {
  const idParsed = idSchema.safeParse(request.nextUrl.searchParams.get("id"));
  const tokenParsed = tokenSchema.safeParse(request.nextUrl.searchParams.get("token"));

  const destination = new URL("/newsletter/unsubscribe", request.nextUrl.origin);
  const response = NextResponse.redirect(destination, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");

  response.cookies.set(UNSUBSCRIBE_COOKIE_NAME, "", unsubscribeCookieClearOptions());

  if (idParsed.success && tokenParsed.success) {
    response.cookies.set(
      UNSUBSCRIBE_COOKIE_NAME,
      encodeUnsubscribeCookie(idParsed.data, tokenParsed.data),
      unsubscribeCookieSetOptions()
    );
  }

  return response;
}