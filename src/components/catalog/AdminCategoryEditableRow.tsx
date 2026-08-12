"use client";

import { useState, useTransition } from "react";
import { updateCategoryAction, setCategoryActiveAction, deleteCategoryAction } from "@/lib/catalog/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FormError, FormSuccess } from "@/components/ui/FormError";

interface AdminCategoryEditableRowCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
}

interface AdminCategoryEditableRowParentOption {
  id: string;
  name: string;
}

interface AdminCategoryEditableRowProps {
  category: AdminCategoryEditableRowCategory;
  parentOptions: AdminCategoryEditableRowParentOption[];
  variant: "main" | "sub";
  subcategoryCount?: number;
}

export function AdminCategoryEditableRow({
  category,
  parentOptions,
  variant,
  subcategoryCount,
}: AdminCategoryEditableRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [parentSelection, setParentSelection] = useState(category.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [isTogglePending, startToggleTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [isDeletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [previousSubcategoryCount, setPreviousSubcategoryCount] = useState(subcategoryCount);

  if (previousSubcategoryCount !== subcategoryCount) {
    setPreviousSubcategoryCount(subcategoryCount);
    setDeleteError(null);
  }

  function handleEditClick() {
    setName(category.name);
    setSlug(category.slug);
    setParentSelection(category.parentId ?? "");
    setError(null);
    setSuccess(null);
    setToggleError(null);
    setDeleteError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setSuccess(null);
    setIsEditing(false);
  }

  function handleToggleActive() {
    setToggleError(null);
    setDeleteError(null);

    const nextIsActive = !category.isActive;

    startToggleTransition(async () => {
      const result = await setCategoryActiveAction({
        categoryId: category.id,
        isActive: nextIsActive,
      });

      if (result.error) {
        setToggleError(result.error);
        return;
      }

      if (!result.categoryId || result.categoryId !== category.id) {
        setToggleError(
          "The category status may have been changed, but its confirmation could not be verified. Please check the category list before trying again."
        );
        return;
      }
    });
  }

  function handleDeleteClick() {
    const confirmed = window.confirm(`Delete "${category.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setToggleError(null);

    startDeleteTransition(async () => {
      const result = await deleteCategoryAction({ categoryId: category.id });

      if (result.error) {
        setDeleteError(result.error);
        return;
      }

      if (!result.categoryId || result.categoryId !== category.id) {
        setDeleteError(
          "The category may have been deleted, but its confirmation could not be verified. Please check the category list before trying again."
        );
      }
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await updateCategoryAction({
        categoryId: category.id,
        name,
        slug,
        parentId: parentSelection === "" ? null : parentSelection,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (!result.categoryId || result.categoryId !== category.id) {
        setError(
          "The category may have been updated, but its confirmation could not be verified. Please check the category list before trying again."
        );
        return;
      }

      setSuccess("Category updated.");
    });
  }

  const nameId = `edit-category-name-${category.id}`;
  const slugId = `edit-category-slug-${category.id}`;
  const parentSelectId = `edit-category-parent-${category.id}`;

  if (!isEditing) {
    const content = (
      <>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 break-words">
            <span className={variant === "main" ? "font-medium" : undefined}>
              {category.name}
            </span>
            <span className="block break-words text-sm text-gray-500 sm:ml-2 sm:inline">
              /{category.slug}
            </span>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
            <StatusBadge isActive={category.isActive} />
            <Button
              type="button"
              variant="outline"
              onClick={handleToggleActive}
              disabled={isTogglePending || isDeletePending}
            >
              {isTogglePending
                ? category.isActive
                  ? "Disabling\u2026"
                  : "Activating\u2026"
                : category.isActive
                  ? "Disable"
                  : "Activate"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleEditClick}
              disabled={isTogglePending || isDeletePending}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDeleteClick}
              disabled={isTogglePending || isDeletePending}
            >
              {isDeletePending ? "Deleting\u2026" : "Delete"}
            </Button>
          </div>
        </div>
        <FormError message={toggleError} />
        <FormError message={deleteError} />
      </>
    );

    if (variant === "main") {
      return <div className="bg-gray-50 p-4">{content}</div>;
    }

    return <li className="p-4 pl-6 sm:pl-8">{content}</li>;
  }

  const formBody = (
    <form
      onSubmit={onSubmit}
      className={variant === "main" ? "bg-gray-50 p-4" : "p-4 pl-6 sm:pl-8"}
    >
      <FormError message={error} />
      <FormSuccess message={success} />

      <div className="mb-3">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          required
        />
      </div>

      <div className="mb-3">
        <Label htmlFor={slugId}>Slug</Label>
        <Input
          id={slugId}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          disabled={isPending}
          required
        />
      </div>

      <div className="mb-3">
        <Label htmlFor={parentSelectId}>Parent</Label>
        <Select
          id={parentSelectId}
          value={parentSelection}
          onChange={(e) => setParentSelection(e.target.value)}
          disabled={isPending}
        >
          <option value="">No parent (Main Category)</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving\u2026" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );

  if (variant === "main") {
    return formBody;
  }

  return <li>{formBody}</li>;
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800"
          : "rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700"
      }
    >
      {isActive ? "Active" : "Disabled"}
    </span>
  );
}