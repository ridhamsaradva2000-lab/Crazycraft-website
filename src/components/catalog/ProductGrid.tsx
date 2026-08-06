import { ProductCard } from "@/components/catalog/ProductCard";
import type { ProductListItem } from "@/lib/catalog/data";

export function ProductGrid({
  products,
  error,
  emptyMessage = "No products match these filters yet.",
}: {
  products: ProductListItem[];
  error: boolean;
  emptyMessage?: string;
}) {
  if (error) {
    return (
      <p className="rounded-lg border border-paper-muted bg-white p-8 text-center font-body text-sm text-clay">
        Something went wrong loading products. Please try again.
      </p>
    );
  }

  if (products.length === 0) {
    return (
      <p className="rounded-lg border border-paper-muted bg-white p-8 text-center font-body text-sm text-ink-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
