import type { MetadataRoute } from "next";
import { clientEnv } from "@/lib/env.client";
import { getSitemapProducts, getSitemapCategories, getSitemapCollections } from "@/lib/catalog/data";

export const dynamic = "force-dynamic";

const MAX_SITEMAP_URLS = 50_000;

const STATIC_PATHS = [
  "",
  "/about",
  "/why-us",
  "/sustainability",
  "/factory-tour",
  "/certifications",
  "/contact",
  "/products",
  "/privacy",
] as const;

/**
 * Because this file is force-dynamic, every /sitemap.xml request re-reads
 * the catalog live via the anonymous createSitemapClient() -- a transient
 * data-layer failure or a temporary excess over the protocol's 50,000 URL
 * ceiling both self-heal on the very next crawl request, so neither
 * condition is ever treated as a reason to fail the request outright.
 * No lastModified property is emitted anywhere; it is optional and we do
 * not emit timestamps whose update semantics have not been separately
 * proven trustworthy.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

  const staticUrls: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${baseUrl}${path}`,
  }));

  const [productsResult, categoriesResult, collectionsResult] = await Promise.all([
    getSitemapProducts(),
    getSitemapCategories(),
    getSitemapCollections(),
  ]);

  if (productsResult.error || categoriesResult.error || collectionsResult.error) {
    console.error("[sitemap] dynamic catalog retrieval failed -- returning static-only sitemap for this request.");
    return staticUrls;
  }

  const productUrls: MetadataRoute.Sitemap = productsResult.slugs.map((slug) => ({
    url: `${baseUrl}/products/${slug}`,
  }));
  const categoryUrls: MetadataRoute.Sitemap = categoriesResult.slugs.map((slug) => ({
    url: `${baseUrl}/categories/${slug}`,
  }));
  const collectionUrls: MetadataRoute.Sitemap = collectionsResult.slugs.map((slug) => ({
    url: `${baseUrl}/collections/${slug}`,
  }));

  const totalCount = staticUrls.length + productUrls.length + categoryUrls.length + collectionUrls.length;

  // Protocol limit: a single sitemap.xml may contain at most 50,000 URLs
  // TOTAL (static + all dynamic entries combined) -- never a per-entity
  // count in isolation. If the combined total ever exceeds this, we must
  // never truncate the list or emit an invalid oversized sitemap; the
  // static-only fallback below is safe and self-heals on the next request
  // once the catalog is sharded. Once the catalog legitimately approaches
  // this threshold, migrate to Next.js's generateSitemaps() to shard into
  // multiple indexed sitemaps instead of raising this constant.
  if (totalCount > MAX_SITEMAP_URLS) {
    console.error(`[sitemap] combined URL total ${totalCount} exceeds MAX_SITEMAP_URLS (${MAX_SITEMAP_URLS}) -- returning static-only sitemap for this request.`);
    return staticUrls;
  }

  return [...staticUrls, ...productUrls, ...categoryUrls, ...collectionUrls];
}