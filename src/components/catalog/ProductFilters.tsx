import Link from "next/link";
import type { Route } from "next";
import type { CategoryOption, CollectionOption } from "@/lib/catalog/data";

export function ProductFilters({
  categories,
  categoriesError,
  collections,
  collectionsError,
  currentQuery,
  currentCategory,
  currentCollection,
}: {
  categories: CategoryOption[];
  categoriesError: boolean;
  collections: CollectionOption[];
  collectionsError: boolean;
  currentQuery?: string;
  currentCategory?: string;
  currentCollection?: string;
}) {
  const hasActiveFilters = Boolean(currentQuery || currentCategory || currentCollection);

  return (
    <form method="get" action="/products" className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <label htmlFor="product-search" className="mb-1 block font-body text-xs font-medium text-ink-muted">
          Search products
        </label>
        <input
          id="product-search"
          type="search"
          name="q"
          defaultValue={currentQuery ?? ""}
          maxLength={100}
          placeholder="e.g. blue pottery vase"
          className="w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        />
      </div>

      {/* Fails gracefully when there are no categories yet — the select
          simply offers only "All categories" rather than being hidden
          entirely, so the form's layout stays stable either way. */}
      <div className="min-w-[180px]">
        <label htmlFor="product-category" className="mb-1 block font-body text-xs font-medium text-ink-muted">
          Category
        </label>
        <select
          id="product-category"
          name="category"
          defaultValue={currentCategory ?? ""}
          disabled={categoriesError}
          className="w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
        {categoriesError && (
          <p className="mt-1 font-body text-xs text-clay">Categories could not be loaded.</p>
        )}
      </div>

      {/* Same graceful-empty pattern as categories above — and only
          rendered at all once there's at least one published collection
          or a genuine load error to report, so an on-brand catalogue
          with no collections yet doesn't show a pointless "All
          collections"-only dropdown. */}
      {(collections.length > 0 || collectionsError) && (
        <div className="min-w-[180px]">
          <label htmlFor="product-collection" className="mb-1 block font-body text-xs font-medium text-ink-muted">
            Collection
          </label>
          <select
            id="product-collection"
            name="collection"
            defaultValue={currentCollection ?? ""}
            disabled={collectionsError}
            className="w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            <option value="">All collections</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.slug}>
                {collection.name}
              </option>
            ))}
          </select>
          {collectionsError && (
            <p className="mt-1 font-body text-xs text-clay">Collections could not be loaded.</p>
          )}
        </div>
      )}

      <button
        type="submit"
        className="rounded-md bg-brand-700 px-4 py-2 font-body text-sm font-medium text-white hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        Apply
      </button>

      {hasActiveFilters && (
        <Link
          href={"/products" as Route}
          className="font-body text-sm text-ink-muted underline hover:text-brand-700"
        >
          Clear filters
        </Link>
      )}
    </form>
  );
}
