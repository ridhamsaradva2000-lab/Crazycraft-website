import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import type { ProductListItem } from "@/lib/catalog/data";

export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/products/${product.slug}` as Route}
      className="group flex flex-col overflow-hidden rounded-lg border border-paper-muted bg-white transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      <div className="relative aspect-square w-full bg-paper-muted">
        {product.primaryImageUrl ? (
          <Image
            src={product.primaryImageUrl}
            alt={product.primaryImageAlt ?? product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          // Fallback preserves the exact same layout box (aspect-square,
          // same dimensions) so the grid never shifts depending on which
          // products happen to have an image yet. aria-hidden since this
          // conveys no information beyond "no photo available" — the
          // product name itself (a real heading below) already labels
          // the card for a screen reader.
          <div
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center font-body text-xs text-ink-muted"
          >
            Image coming soon
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.categoryName && (
          <span className="font-body text-xs uppercase tracking-wide text-ink-muted">
            {product.categoryName}
          </span>
        )}
        <h3 className="font-display text-base text-brand-900 group-hover:text-brand-700">
          {product.name}
        </h3>

        <span className="mt-auto pt-3 font-body text-sm font-medium text-brand-700 group-hover:underline">
          View Details →
        </span>
      </div>
    </Link>
  );
}
