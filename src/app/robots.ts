import type { MetadataRoute } from "next";
import { clientEnv } from "@/lib/env.client";

/**
 * robots.txt is a crawl-budget courtesy signal, not a security boundary
 * -- private route groups ((admin), (buyer)) already carry authoritative
 * layout-level robots: { index: false, follow: false } metadata from
 * Module 9 Step 2, and that remains the real protection.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/dashboard", "/login", "/register", "/auth", "/api"],
      },
    ],
    sitemap: `${clientEnv.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}