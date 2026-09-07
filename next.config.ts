import type { NextConfig } from "next";

// Derived directly from NEXT_PUBLIC_SUPABASE_URL rather than assuming
// https — local Supabase (http://127.0.0.1:54321) and production
// Supabase (https://<project>.supabase.co) genuinely differ in protocol,
// and local dev also uses a non-default port that must be preserved.
// Next.js's remotePatterns type requires protocol to be exactly "http" or
// "https" (not an arbitrary string), so this is validated, not just cast.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : undefined;

const supabaseOrigin = supabaseUrl ? supabaseUrl.origin : undefined;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
  : undefined;
const siteOrigin = siteUrl ? siteUrl.origin : undefined;

// Module 10 -- CSP Report-Only baseline policy, plus violation reporting.
// Intentionally permissive starting point covering exactly the third-party
// origins already proven necessary by the verified production
// architecture: Meta Pixel (connect.facebook.net / www.facebook.com),
// Cloudflare Turnstile (challenges.cloudflare.com), Supabase (derived from
// the already-validated NEXT_PUBLIC_SUPABASE_URL above -- never a
// second/hardcoded project), and placehold.co for configured placeholder
// images. Report-Only means no resource is blocked at this stage.
// report-uri (legacy, broad browser compatibility) and report-to (modern
// Reporting API, paired with the Reporting-Endpoints header below) both
// point at a minimal, unauthenticated, no-op-storage Route Handler used
// only during this manual observation phase. siteOrigin/supabaseOrigin
// are resolved once when this config module is evaluated (at build/start
// time), not per request.
const cspReportOnlyDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  supabaseOrigin
    ? `img-src 'self' data: blob: https://placehold.co https://www.facebook.com ${supabaseOrigin}`
    : "img-src 'self' data: blob: https://placehold.co https://www.facebook.com",
  "font-src 'self' data:",
  supabaseOrigin
    ? `connect-src 'self' https://connect.facebook.net https://www.facebook.com https://challenges.cloudflare.com ${supabaseOrigin}`
    : "connect-src 'self' https://connect.facebook.net https://www.facebook.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
  "report-to csp-endpoint",
];

const cspReportOnlyValue = cspReportOnlyDirectives.join("; ") + ";";
const supabaseProtocol: "http" | "https" | undefined =
  supabaseUrl?.protocol === "http:" ? "http" : supabaseUrl?.protocol === "https:" ? "https" : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Stable top-level option (Next.js 15.5+) — not under `experimental`.
  typedRoutes: true,
  async headers() {
  return [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        },
        {
          key: "Content-Security-Policy-Report-Only",
          value: cspReportOnlyValue,
        },
        {
          key: "Reporting-Endpoints",
          value: siteOrigin
            ? `csp-endpoint="${siteOrigin}/api/csp-report"`
            : "",
        },
      ],
    },
  ];
},

  images: {
    // Local Supabase uses 127.0.0.1 in development. Next.js image
    // optimization blocks private/local IPs by default, so permit them
    // only during local development. Production remains protected.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  remotePatterns: [
    ...(supabaseUrl && supabaseProtocol
      ? [
          {
            protocol: supabaseProtocol,
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port || "",
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : []),
    {
      protocol: "https",
      hostname: "placehold.co",
      pathname: "/**",
    },
  ],
  formats: ["image/avif", "image/webp"],
},
};

export default nextConfig;
