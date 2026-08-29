import {
  getAdminProducts,
  getAdminCategories,
  getAdminCollections,
} from "@/lib/admin/catalog/data";
import { AdminCreateProductForm } from "@/components/catalog/AdminCreateProductForm";
import { AdminProductCard } from "@/components/catalog/AdminProductCard";

function PageIntro() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">Products</h1>
      <p className="mt-1 text-sm text-gray-600">
        Review all products, including draft, published, and archived entries.
      </p>
    </div>
  );
}

export default async function AdminProductsPage() {
  const [
    { error: productsError, products },
    { error: categoriesError, categories },
    { error: collectionsError, collections },
  ] = await Promise.all([getAdminProducts(), getAdminCategories(), getAdminCollections()]);

  const error = productsError ?? categoriesError ?? collectionsError;

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <PageIntro />
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      </div>
    );
  }

  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  const collectionOptions = collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
  }));

  return (
    <div className="p-4 sm:p-6">
      <PageIntro />
      <AdminCreateProductForm categories={categoryOptions} />
      {products.length === 0 && (
        <p className="text-gray-600">No products exist yet.</p>
      )}
      <div className="space-y-4">
        {products.map((product) => (
          <AdminProductCard
            key={product.id}
            productId={product.id}
            productName={product.name}
            editableRowProps={{
              product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                status: product.status,
                categoryId: product.categoryId,
                moq: product.moq,
                leadTimeDays: product.leadTimeDays,
                isCustomizable: product.isCustomizable,
                description: product.description,
                shortDescription: product.shortDescription,
                baseMaterial: product.baseMaterial,
                dimensions: product.dimensions,
                weightGrams: product.weightGrams,
                hsCode: product.hsCode,
                customizationNotes: product.customizationNotes,
                metaTitle: product.metaTitle,
                metaDescription: product.metaDescription,
              },
              categories: categoryOptions,
            }}
            variantsCollectionsProps={{
              productId: product.id,
              initialVariants: product.variants,
              collections: collectionOptions,
              initialCollectionIds: product.collectionIds,
            }}
            imagesProps={{
              productId: product.id,
              initialImages: product.images,
            }}
          />
        ))}
      </div>
    </div>
  );
}