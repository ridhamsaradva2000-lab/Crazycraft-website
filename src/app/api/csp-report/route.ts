import type { NextRequest } from "next/server";

/**
 * Module 10 -- temporary CSP Report-Only violation receiver.
 *
 * This endpoint exists ONLY to give the browser's report-uri/report-to
 * reporting mechanisms a real target during the CSP Report-Only
 * observation phase. It intentionally:
 *   - performs NO authentication (browsers send these reports
 *     unauthenticated and cannot attach any session)
 *   - performs NO database read or write of any kind
 *   - performs NO persistence of report bodies
 *   - never reads the request body at all, so no attacker-controlled
 *     content is ever parsed, logged, or stored -- only non-sensitive
 *     request headers (content-type, content-length) are logged
 *
 * Violations are reviewed manually via browser DevTools Console/Network
 * during this phase, not via this endpoint.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "unknown";
  const contentLength = request.headers.get("content-length") ?? "unknown";
  console.log(
    `[csp-report] received report-only violation notification (content-type=${contentType}, content-length=${contentLength})`
  );
  return new Response(null, { status: 204 });
}