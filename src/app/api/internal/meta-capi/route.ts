import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { deliverPendingCapiEvents } from "@/lib/meta/capi";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function secretMatches(value: string | null, expected: string): boolean {
  if (!value?.startsWith("Bearer ")) return false;

  const supplied = value.slice("Bearer ".length);
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();

  return timingSafeEqual(suppliedDigest, expectedDigest);
}

export async function GET(request: Request) {
  const cronSecret = serverEnv.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CAPI recovery worker is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!secretMatches(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const summary = await deliverPendingCapiEvents({ limit: 25 });
    return NextResponse.json(summary, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Meta CAPI recovery worker failed:",
      error instanceof Error ? error.message : "unknown_error"
    );

    return NextResponse.json(
      { error: "CAPI recovery worker failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
