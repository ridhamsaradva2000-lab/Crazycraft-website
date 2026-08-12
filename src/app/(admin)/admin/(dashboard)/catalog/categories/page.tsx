import { getAdminCategories, type AdminCategoryRow } from "@/lib/admin/catalog/data";
import { AdminCreateMainCategoryForm } from "@/components/catalog/AdminCreateMainCategoryForm";
import { AdminCreateSubcategoryForm } from "@/components/catalog/AdminCreateSubcategoryForm";
import { AdminCategoryEditableRow } from "@/components/catalog/AdminCategoryEditableRow";

function PageIntro() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">Categories</h1>
      <p className="mt-1 text-sm text-gray-600">
        Review Main Categories and their Subcategories, including disabled entries.
      </p>
    </div>
  );
}

export default async function AdminCategoriesPage() {
  const { error, categories } = await getAdminCategories();

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


  const mainCategories = categories.filter((category) => category.parentId === null);
  const subcategoriesByParentId = new Map<string, AdminCategoryRow[]>();

  for (const category of categories) {
    if (category.parentId === null) continue;

    const existing = subcategoriesByParentId.get(category.parentId) ?? [];
    existing.push(category);
    subcategoriesByParentId.set(category.parentId, existing);
  }

  return (
    <div className="p-4 sm:p-6">
      <PageIntro />

      <AdminCreateMainCategoryForm />
      <AdminCreateSubcategoryForm
        mainCategories={mainCategories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
      />

      {mainCategories.length === 0 && (
        <p className="mb-6 text-gray-600">No categories exist yet.</p>
      )}

      <div className="space-y-6">
        {mainCategories.map((main) => {
          const subcategories = subcategoriesByParentId.get(main.id) ?? [];

          const parentOptions = mainCategories
            .filter((option) => option.id !== main.id)
            .map((option) => ({ id: option.id, name: option.name }));

          return (
            <div key={main.id} className="rounded-md border border-gray-200">
              <AdminCategoryEditableRow
                category={main}
                parentOptions={parentOptions}
                variant="main"
                subcategoryCount={subcategories.length}
              />

              {subcategories.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {subcategories.map((sub) => {
                    const subParentOptions = mainCategories
                      .filter((option) => option.id !== sub.id)
                      .map((option) => ({ id: option.id, name: option.name }));

                    return (
                      <AdminCategoryEditableRow
                        key={sub.id}
                        category={sub}
                        parentOptions={subParentOptions}
                        variant="sub"
                      />
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}