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
const supabaseProtocol: "http" | "https" | undefined =
  supabaseUrl?.protocol === "http:" ? "http" : supabaseUrl?.protocol === "https:" ? "https" : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Stable top-level option (Next.js 15.5+) — not under `experimental`.
  typedRoutes: true,

  images: {
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
