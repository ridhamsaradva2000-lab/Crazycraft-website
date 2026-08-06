import Link from "next/link";
import type { Route } from "next";

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  /** e.g. "/products" or "/categories/blue-pottery" */
  basePath: string;
  /** Existing filters to preserve across page links (q, category, etc.) — never includes "page" itself. */
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function hrefForPage(page: number): Route {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    // Canonical URL behavior: page 1 has no "page" param at all, so
    // /products and /products?page=1 are never treated as two different
    // URLs for the same content.
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return (query ? `${basePath}?${query}` : basePath) as Route;
  }

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4">
      {prevDisabled ? (
        <span className="font-body text-sm text-ink-muted opacity-50" aria-disabled="true">
          ← Previous
        </span>
      ) : (
        <Link href={hrefForPage(currentPage - 1)} className="font-body text-sm text-brand-700 hover:underline">
          ← Previous
        </Link>
      )}

      <span className="font-body text-sm text-ink-muted" aria-current="page">
        Page {currentPage} of {totalPages}
      </span>

      {nextDisabled ? (
        <span className="font-body text-sm text-ink-muted opacity-50" aria-disabled="true">
          Next →
        </span>
      ) : (
        <Link href={hrefForPage(currentPage + 1)} className="font-body text-sm text-brand-700 hover:underline">
          Next →
        </Link>
      )}
    </nav>
  );
}
