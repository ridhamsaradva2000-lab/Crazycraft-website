"use client";

import { useState, useTransition } from "react";
import { updateProductAction } from "@/lib/catalog/actions";
import type { UpdateProductActionInput } from "@/lib/catalog/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FormError, FormSuccess } from "@/components/ui/FormError";

type ProductStatus = UpdateProductActionInput["status"];

interface AdminProductEditableRowProduct {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  categoryId: string | null;
  moq: number;
  leadTimeDays: number | null;
  isCustomizable: boolean;
  description: string | null;
  shortDescription: string | null;
  baseMaterial: string | null;
  dimensions: string | null;
  weightGrams: number | null;
  hsCode: string | null;
  customizationNotes: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

interface AdminProductEditableRowCategory {
  id: string;
  name: string;
}

interface AdminProductEditableRowProps {
  product: AdminProductEditableRowProduct;
  categories: AdminProductEditableRowCategory[];
}

interface ProductFieldsState {
  name: string;
  slug: string;
  status: ProductStatus;
  categoryId: string;
  moq: string;
  leadTimeDays: string;
  isCustomizable: boolean;
  description: string;
  shortDescription: string;
  baseMaterial: string;
  dimensions: string;
  weightGrams: string;
  hsCode: string;
  customizationNotes: string;
  metaTitle: string;
  metaDescription: string;
}

function toFieldsState(product: AdminProductEditableRowProduct): ProductFieldsState {
  return {
    name: product.name,
    slug: product.slug,
    status: product.status,
    categoryId: product.categoryId ?? "",
    moq: String(product.moq),
    leadTimeDays: product.leadTimeDays !== null ? String(product.leadTimeDays) : "",
    isCustomizable: product.isCustomizable,
    description: product.description ?? "",
    shortDescription: product.shortDescription ?? "",
    baseMaterial: product.baseMaterial ?? "",
    dimensions: product.dimensions ?? "",
    weightGrams: product.weightGrams !== null ? String(product.weightGrams) : "",
    hsCode: product.hsCode ?? "",
    customizationNotes: product.customizationNotes ?? "",
    metaTitle: product.metaTitle ?? "",
    metaDescription: product.metaDescription ?? "",
  };
}

const textareaClassName =
  "w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-50";

export function AdminProductEditableRow({ product, categories }: AdminProductEditableRowProps) {
  const [saved, setSaved] = useState<ProductFieldsState>(() => toFieldsState(product));
  const [draft, setDraft] = useState<ProductFieldsState>(() => toFieldsState(product));
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateDraftField<K extends keyof ProductFieldsState>(key: K, value: ProductFieldsState[K]) {
    setSuccess(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleEditClick() {
    setDraft(saved);
    setError(null);
    setSuccess(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setDraft(saved);
    setError(null);
    setIsEditing(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await updateProductAction({
        productId: product.id,
        name: draft.name,
        slug: draft.slug,
        description: draft.description,
        shortDescription: draft.shortDescription,
        categoryId: draft.categoryId,
        moq: draft.moq,
        leadTimeDays: draft.leadTimeDays,
        baseMaterial: draft.baseMaterial,
        dimensions: draft.dimensions,
        weightGrams: draft.weightGrams,
        hsCode: draft.hsCode,
        isCustomizable: draft.isCustomizable,
        customizationNotes: draft.customizationNotes,
        metaTitle: draft.metaTitle,
        metaDescription: draft.metaDescription,
        status: draft.status,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (!result.productId) {
        setError(
          "The product may have been updated, but its confirmation could not be verified. Please refresh the product list before trying again."
        );
        return;
      }

      setSaved(draft);
      setIsEditing(false);
      setSuccess("Product updated.");
    });
  }

  const nameId = `edit-product-name-${product.id}`;
  const slugId = `edit-product-slug-${product.id}`;
  const statusId = `edit-product-status-${product.id}`;
  const categoryIdFieldId = `edit-product-category-${product.id}`;
  const moqId = `edit-product-moq-${product.id}`;
  const leadTimeId = `edit-product-lead-time-${product.id}`;
  const weightId = `edit-product-weight-${product.id}`;
  const baseMaterialId = `edit-product-base-material-${product.id}`;
  const dimensionsId = `edit-product-dimensions-${product.id}`;
  const hsCodeId = `edit-product-hs-code-${product.id}`;
  const metaTitleId = `edit-product-meta-title-${product.id}`;
  const shortDescriptionId = `edit-product-short-description-${product.id}`;
  const descriptionId = `edit-product-description-${product.id}`;
  const customizationNotesId = `edit-product-customization-notes-${product.id}`;
  const metaDescriptionId = `edit-product-meta-description-${product.id}`;
  const isCustomizableId = `edit-product-is-customizable-${product.id}`;

  const categoryName = saved.categoryId
    ? (categories.find((category) => category.id === saved.categoryId)?.name ?? "No category")
    : "No category";

  if (!isEditing) {
    return (
      <div className="rounded-md border border-gray-200 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 break-words">
            <span className="font-medium">{saved.name}</span>
            <span className="block break-words text-sm text-gray-500 sm:ml-2 sm:inline">
              /{saved.slug}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={saved.status} />
            <Button type="button" variant="outline" onClick={handleEditClick}>
              Edit
            </Button>
          </div>
        </div>

        <FormSuccess message={success} />

        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <dt className="text-gray-500">Category</dt>
            <dd>{categoryName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">MOQ</dt>
            <dd>{saved.moq}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Lead time</dt>
            <dd>{saved.leadTimeDays !== "" ? `${saved.leadTimeDays} days` : "\u2014"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Customizable</dt>
            <dd>{saved.isCustomizable ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 p-4">
      <form onSubmit={onSubmit}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium">Edit Product</h3>
        </div>

        <FormError message={error} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={draft.name}
              onChange={(e) => updateDraftField("name", e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div>
            <Label htmlFor={slugId}>Slug</Label>
            <Input
              id={slugId}
              value={draft.slug}
              onChange={(e) => updateDraftField("slug", e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div>
            <Label htmlFor={statusId}>Status</Label>
            <Select
              id={statusId}
              value={draft.status}
              onChange={(e) => updateDraftField("status", e.target.value as ProductStatus)}
              disabled={isPending}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </Select>
          </div>

          <div>
            <Label htmlFor={categoryIdFieldId}>Category</Label>
            <Select
              id={categoryIdFieldId}
              value={draft.categoryId}
              onChange={(e) => updateDraftField("categoryId", e.target.value)}
              disabled={isPending}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor={moqId}>MOQ</Label>
            <Input
              id={moqId}
              type="number"
              min={1}
              step={1}
              value={draft.moq}
              onChange={(e) => updateDraftField("moq", e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="flex items-end gap-2">
            <input
              id={isCustomizableId}
              type="checkbox"
              checked={draft.isCustomizable}
              onChange={(e) => updateDraftField("isCustomizable", e.target.checked)}
              disabled={isPending}
            />
            <Label htmlFor={isCustomizableId}>Is customizable</Label>
          </div>

          <div>
            <Label htmlFor={leadTimeId}>Lead time (days)</Label>
            <Input
              id={leadTimeId}
              type="number"
              min={0}
              step={1}
              value={draft.leadTimeDays}
              onChange={(e) => updateDraftField("leadTimeDays", e.target.value)}
              disabled={isPending}
            />
          </div>

          <div>
            <Label htmlFor={weightId}>Weight (grams)</Label>
            <Input
              id={weightId}
              type="number"
              min={0}
              step={1}
              value={draft.weightGrams}
              onChange={(e) => updateDraftField("weightGrams", e.target.value)}
              disabled={isPending}
            />
          </div>

          <div>
            <Label htmlFor={baseMaterialId}>Base material</Label>
            <Input
              id={baseMaterialId}
              value={draft.baseMaterial}
              onChange={(e) => updateDraftField("baseMaterial", e.target.value)}
              disabled={isPending}
            />
          </div>

          <div>
            <Label htmlFor={dimensionsId}>Dimensions</Label>
            <Input
              id={dimensionsId}
              value={draft.dimensions}
              onChange={(e) => updateDraftField("dimensions", e.target.value)}
              disabled={isPending}
            />
          </div>

          <div>
            <Label htmlFor={hsCodeId}>HS code</Label>
            <Input
              id={hsCodeId}
              value={draft.hsCode}
              onChange={(e) => updateDraftField("hsCode", e.target.value)}
              disabled={isPending}
            />
          </div>

          <div>
            <Label htmlFor={metaTitleId}>Meta title</Label>
            <Input
              id={metaTitleId}
              value={draft.metaTitle}
              onChange={(e) => updateDraftField("metaTitle", e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor={shortDescriptionId}>Short description</Label>
          <textarea
            id={shortDescriptionId}
            value={draft.shortDescription}
            onChange={(e) => updateDraftField("shortDescription", e.target.value)}
            disabled={isPending}
            rows={2}
            className={textareaClassName}
          />
        </div>

        <div className="mt-4">
          <Label htmlFor={descriptionId}>Description</Label>
          <textarea
            id={descriptionId}
            value={draft.description}
            onChange={(e) => updateDraftField("description", e.target.value)}
            disabled={isPending}
            rows={4}
            className={textareaClassName}
          />
        </div>

        <div className="mt-4">
          <Label htmlFor={customizationNotesId}>Customization notes</Label>
          <textarea
            id={customizationNotesId}
            value={draft.customizationNotes}
            onChange={(e) => updateDraftField("customizationNotes", e.target.value)}
            disabled={isPending}
            rows={2}
            className={textareaClassName}
          />
        </div>

        <div className="mt-4">
          <Label htmlFor={metaDescriptionId}>Meta description</Label>
          <textarea
            id={metaDescriptionId}
            value={draft.metaDescription}
            onChange={(e) => updateDraftField("metaDescription", e.target.value)}
            disabled={isPending}
            rows={2}
            className={textareaClassName}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving\u2026" : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const className =
    status === "published"
      ? "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800"
      : status === "draft"
        ? "rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700"
        : "rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800";

  return <span className={className}>{status}</span>;
}