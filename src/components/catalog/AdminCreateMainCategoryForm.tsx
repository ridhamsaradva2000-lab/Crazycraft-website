"use client";

import { useState, useTransition } from "react";
import { createCategoryAction } from "@/lib/catalog/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FormError, FormSuccess } from "@/components/ui/FormError";

export function AdminCreateMainCategoryForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdCategoryId, setCreatedCategoryId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatedCategoryId(null);

    startTransition(async () => {
      const result = await createCategoryAction({
        name,
        slug,
        parentId: null,
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

      setName("");
      setSlug("");
      setIsActive(true);
      setCreatedCategoryId(result.categoryId);
      setSuccess("Main category created.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 rounded-md border border-gray-200 p-4">
      <h2 className="mb-4 text-lg font-medium">Create Main Category</h2>

      <FormError message={error} />
      <FormSuccess message={success} />

      <div className="mb-3">
        <Label htmlFor="main-category-name">Name</Label>
        <Input
          id="main-category-name"
          value={name}
          onChange={(e) => { setSuccess(null); setName(e.target.value); }}
          disabled={isPending}
          required
        />
      </div>

      <div className="mb-3">
        <Label htmlFor="main-category-slug">Slug</Label>
        <Input
          id="main-category-slug"
          value={slug}
          onChange={(e) => { setSuccess(null); setSlug(e.target.value); }}
          disabled={isPending}
          required
        />
      </div>

      <fieldset className="mb-4" disabled={isPending}>
        <legend className="mb-1.5 block font-body text-sm font-medium text-ink">
          Initial status
        </legend>
        <div className="mt-1 flex items-center gap-4">
          <label
            htmlFor="main-category-status-active"
            className="flex items-center gap-2 text-sm"
          >
            <input
              id="main-category-status-active"
              type="radio"
              name="main-category-status"
              value="active"
              checked={isActive}
              onChange={() => { setSuccess(null); setIsActive(true); }}
            />
            Active
          </label>
          <label
            htmlFor="main-category-status-disabled"
            className="flex items-center gap-2 text-sm"
          >
            <input
              id="main-category-status-disabled"
              type="radio"
              name="main-category-status"
              value="disabled"
              checked={!isActive}
              onChange={() => { setSuccess(null); setIsActive(false); }}
            />
            Disabled
          </label>
        </div>
      </fieldset>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create Main Category"}
      </Button>

      {createdCategoryId && (
        <span className="sr-only" data-created-category-id={createdCategoryId}>
          Created category ID: {createdCategoryId}
        </span>
      )}
    </form>
  );
}
