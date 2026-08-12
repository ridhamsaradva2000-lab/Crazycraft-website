"use client";

import { useState, useTransition } from "react";
import { createCategoryAction } from "@/lib/catalog/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FormError, FormSuccess } from "@/components/ui/FormError";

interface AdminCreateSubcategoryFormMainCategory {
  id: string;
  name: string;
}

interface AdminCreateSubcategoryFormProps {
  mainCategories: AdminCreateSubcategoryFormMainCategory[];
}

export function AdminCreateSubcategoryForm({
  mainCategories,
}: AdminCreateSubcategoryFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState(mainCategories[0]?.id ?? "");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdSubcategoryId, setCreatedSubcategoryId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasMainCategories = mainCategories.length > 0;

  const selectedParentId = mainCategories.some((main) => main.id === parentId)
    ? parentId
    : (mainCategories[0]?.id ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatedSubcategoryId(null);

    if (!hasMainCategories || !selectedParentId) {
      setError("Select a parent Main Category before creating a Subcategory.");
      return;
    }

    startTransition(async () => {
      const result = await createCategoryAction({
        name,
        slug,
        parentId: selectedParentId,
        isActive,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (!result.categoryId) {
        setError(
          "The category may have been created, but its confirmation could not be verified. Please check the category list before trying again."
        );
        return;
      }

      setCreatedSubcategoryId(result.categoryId);
      setName("");
      setSlug("");
      setIsActive(true);
      setParentId(mainCategories[0]?.id ?? "");
      setSuccess("Subcategory created.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 rounded-md border border-gray-200 p-4">
      <h2 className="mb-4 text-lg font-medium">Create Subcategory</h2>

      {!hasMainCategories && (
        <p className="mb-4 text-sm text-gray-600">
          Create a Main Category before adding a Subcategory.
        </p>
      )}

      <div className="mb-3">
        <Label htmlFor="subcategory-name">Name</Label>
        <Input
          id="subcategory-name"
          value={name}
          onChange={(e) => { setSuccess(null); setName(e.target.value); }}
          required
          disabled={isPending || !hasMainCategories}
        />
      </div>

      <div className="mb-3">
        <Label htmlFor="subcategory-slug">Slug</Label>
        <Input
          id="subcategory-slug"
          value={slug}
          onChange={(e) => { setSuccess(null); setSlug(e.target.value); }}
          required
          disabled={isPending || !hasMainCategories}
        />
      </div>

      <div className="mb-3">
        <Label htmlFor="subcategory-parent">Parent Main Category</Label>
        <Select
          id="subcategory-parent"
          value={selectedParentId}
          onChange={(e) => { setSuccess(null); setParentId(e.target.value); }}
          required
          disabled={isPending || !hasMainCategories}
        >
          {mainCategories.map((main) => (
            <option key={main.id} value={main.id}>
              {main.name}
            </option>
          ))}
        </Select>
      </div>

      <fieldset
        className="mb-4"
        disabled={isPending || !hasMainCategories}
      >
        <legend className="mb-1 text-sm font-medium text-gray-700">
          Initial status
        </legend>
        <div className="mt-1 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              id="subcategory-status-active"
              name="subcategory-status"
              checked={isActive === true}
              onChange={() => { setSuccess(null); setIsActive(true); }}
            />
            <Label htmlFor="subcategory-status-active">Active</Label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              id="subcategory-status-disabled"
              name="subcategory-status"
              checked={isActive === false}
              onChange={() => { setSuccess(null); setIsActive(false); }}
            />
            <Label htmlFor="subcategory-status-disabled">Disabled</Label>
          </div>
        </div>
      </fieldset>

      <FormError message={error} />
      <FormSuccess message={success} />

      <Button
        type="submit"
        disabled={isPending || !hasMainCategories || !selectedParentId}
      >
        {isPending ? "Creating\u2026" : "Create Subcategory"}
      </Button>

      {createdSubcategoryId && (
        <span
          className="sr-only"
          data-created-subcategory-id={createdSubcategoryId}
        />
      )}
    </form>
  );
}