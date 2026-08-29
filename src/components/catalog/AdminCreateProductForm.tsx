"use client";

import { useState, useTransition } from "react";
import { createProductAction } from "@/lib/catalog/actions";
import type { CreateProductActionInput } from "@/lib/catalog/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FormError, FormSuccess } from "@/components/ui/FormError";

type ProductStatus = CreateProductActionInput["status"];

interface AdminCreateProductFormCategory {
  id: string;
  name: string;
}

interface AdminCreateProductFormProps {
  categories: AdminCreateProductFormCategory[];
}

const INITIAL_STATUS: ProductStatus = "draft";

const textareaClassName =
  "w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-50";

export function AdminCreateProductForm({ categories }: AdminCreateProductFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<ProductStatus>(INITIAL_STATUS);
  const [categoryId, setCategoryId] = useState("");
  const [moq, setMoq] = useState("1");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [baseMaterial, setBaseMaterial] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [isCustomizable, setIsCustomizable] = useState(false);
  const [customizationNotes, setCustomizationNotes] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetToDefaults() {
    setName("");
    setSlug("");
    setStatus(INITIAL_STATUS);
    setCategoryId("");
    setMoq("1");
    setLeadTimeDays("");
    setBaseMaterial("");
    setDimensions("");
    setWeightGrams("");
    setHsCode("");
    setIsCustomizable(false);
    setCustomizationNotes("");
    setShortDescription("");
    setDescription("");
    setMetaTitle("");
    setMetaDescription("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatedProductId(null);

    startTransition(async () => {
      const result = await createProductAction({
        name,
        slug,
        description,
        shortDescription,
        categoryId,
        moq,
        leadTimeDays,
        baseMaterial,
        dimensions,
        weightGrams,
        hsCode,
        isCustomizable,
        customizationNotes,
        metaTitle,
        metaDescription,
        status,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (!result.productId) {
        setError(
          "The product may have been created, but its confirmation could not be verified. Please check the product list before trying again."
        );
        return;
      }

      setCreatedProductId(result.productId);
      resetToDefaults();
      setSuccess("Product created.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 rounded-md border border-gray-200 p-4">
      <h2 className="mb-4 text-lg font-medium">Create Product</h2>

      <FormError message={error} />
      <FormSuccess message={success} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="product-name">Name</Label>
          <Input
            id="product-name"
            value={name}
            onChange={(e) => { setSuccess(null); setName(e.target.value); }}
            disabled={isPending}
            required
          />
        </div>

        <div>
          <Label htmlFor="product-slug">Slug</Label>
          <Input
            id="product-slug"
            value={slug}
            onChange={(e) => { setSuccess(null); setSlug(e.target.value); }}
            disabled={isPending}
            required
          />
        </div>

        <div>
          <Label htmlFor="product-status">Status</Label>
          <Select
            id="product-status"
            value={status}
            onChange={(e) => { setSuccess(null); setStatus(e.target.value as ProductStatus); }}
            disabled={isPending}
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </Select>
        </div>

        <div>
          <Label htmlFor="product-category">Category</Label>
          <Select
            id="product-category"
            value={categoryId}
            onChange={(e) => { setSuccess(null); setCategoryId(e.target.value); }}
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
          <Label htmlFor="product-moq">MOQ</Label>
          <Input
            id="product-moq"
            type="number"
            min={1}
            step={1}
            value={moq}
            onChange={(e) => { setSuccess(null); setMoq(e.target.value); }}
            disabled={isPending}
            required
          />
        </div>

        <div className="flex items-end gap-2">
          <input
            id="product-is-customizable"
            type="checkbox"
            checked={isCustomizable}
            onChange={(e) => { setSuccess(null); setIsCustomizable(e.target.checked); }}
            disabled={isPending}
          />
          <Label htmlFor="product-is-customizable">Is customizable</Label>
        </div>

        <div>
          <Label htmlFor="product-lead-time">Lead time (days)</Label>
          <Input
            id="product-lead-time"
            type="number"
            min={0}
            step={1}
            value={leadTimeDays}
            onChange={(e) => { setSuccess(null); setLeadTimeDays(e.target.value); }}
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="product-weight">Weight (grams)</Label>
          <Input
            id="product-weight"
            type="number"
            min={0}
            step={1}
            value={weightGrams}
            onChange={(e) => { setSuccess(null); setWeightGrams(e.target.value); }}
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="product-base-material">Base material</Label>
          <Input
            id="product-base-material"
            value={baseMaterial}
            onChange={(e) => { setSuccess(null); setBaseMaterial(e.target.value); }}
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="product-dimensions">Dimensions</Label>
          <Input
            id="product-dimensions"
            value={dimensions}
            onChange={(e) => { setSuccess(null); setDimensions(e.target.value); }}
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="product-hs-code">HS code</Label>
          <Input
            id="product-hs-code"
            value={hsCode}
            onChange={(e) => { setSuccess(null); setHsCode(e.target.value); }}
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="product-meta-title">Meta title</Label>
          <Input
            id="product-meta-title"
            value={metaTitle}
            onChange={(e) => { setSuccess(null); setMetaTitle(e.target.value); }}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor="product-short-description">Short description</Label>
        <textarea
          id="product-short-description"
          value={shortDescription}
          onChange={(e) => { setSuccess(null); setShortDescription(e.target.value); }}
          disabled={isPending}
          rows={2}
          className={textareaClassName}
        />
      </div>

      <div className="mt-4">
        <Label htmlFor="product-description">Description</Label>
        <textarea
          id="product-description"
          value={description}
          onChange={(e) => { setSuccess(null); setDescription(e.target.value); }}
          disabled={isPending}
          rows={4}
          className={textareaClassName}
        />
      </div>

      <div className="mt-4">
        <Label htmlFor="product-customization-notes">Customization notes</Label>
        <textarea
          id="product-customization-notes"
          value={customizationNotes}
          onChange={(e) => { setSuccess(null); setCustomizationNotes(e.target.value); }}
          disabled={isPending}
          rows={2}
          className={textareaClassName}
        />
      </div>

      <div className="mt-4">
        <Label htmlFor="product-meta-description">Meta description</Label>
        <textarea
          id="product-meta-description"
          value={metaDescription}
          onChange={(e) => { setSuccess(null); setMetaDescription(e.target.value); }}
          disabled={isPending}
          rows={2}
          className={textareaClassName}
        />
      </div>

      <div className="mt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating\u2026" : "Create Product"}
        </Button>
      </div>

      {createdProductId && (
        <span className="sr-only" data-created-product-id={createdProductId} />
      )}
    </form>
  );
}