"use client";

import { useState, useRef, useTransition } from "react";
import {
  createProductVariantAction,
  updateProductVariantAction,
  deleteProductVariantAction,
  assignProductCollectionAction,
  unassignProductCollectionAction,
} from "@/lib/catalog/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FormError, FormSuccess } from "@/components/ui/FormError";

interface AdminProductVariantsCollectionsVariant {
  id: string;
  variantName: string;
  sku: string | null;
  priceNote: string | null;
}

interface AdminProductVariantsCollectionsCollection {
  id: string;
  name: string;
}

interface AdminProductVariantsCollectionsProps {
  productId: string;
  initialVariants: AdminProductVariantsCollectionsVariant[];
  collections: AdminProductVariantsCollectionsCollection[];
  initialCollectionIds: string[];
}

export function AdminProductVariantsCollections({
  productId,
  initialVariants,
  collections,
  initialCollectionIds,
}: AdminProductVariantsCollectionsProps) {
  const [variants, setVariants] = useState<AdminProductVariantsCollectionsVariant[]>(initialVariants);
  const [assignedCollectionIds, setAssignedCollectionIds] = useState<string[]>(initialCollectionIds);

  const [newVariantName, setNewVariantName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newPriceNote, setNewPriceNote] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editVariantName, setEditVariantName] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editPriceNote, setEditPriceNote] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [isSavingEdit, startEditTransition] = useTransition();

  const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const isVariantMutationPending = isCreating || isSavingEdit || isDeleting;
  const variantMutationLockRef = useRef(false);

  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [collectionSuccess, setCollectionSuccess] = useState<string | null>(null);
  const [isTogglingCollection, startCollectionTransition] = useTransition();
  const collectionMutationLockRef = useRef(false);

  function clearVariantFeedback() {
    setCreateError(null);
    setCreateSuccess(null);
    setEditError(null);
    setEditSuccess(null);
    setDeleteError(null);
    setDeleteSuccess(null);
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (variantMutationLockRef.current) return;
    variantMutationLockRef.current = true;
    clearVariantFeedback();

    startCreateTransition(async () => {
      try {
        const result = await createProductVariantAction({
          productId,
          variantName: newVariantName,
          sku: newSku,
          priceNote: newPriceNote,
        });

        if (result.error) {
          setCreateError(result.error);
          return;
        }

        if (!result.variant) {
          setCreateError(
            "The variant may have been created, but its confirmation could not be verified. Please refresh the product list before trying again."
          );
          return;
        }

        const confirmedVariant = result.variant;
        setVariants((prev) => [...prev, confirmedVariant]);
        setNewVariantName("");
        setNewSku("");
        setNewPriceNote("");
        setCreateSuccess("Variant added.");
      } finally {
        variantMutationLockRef.current = false;
      }
    });
  }

  function handleEditClick(variant: AdminProductVariantsCollectionsVariant) {
    if (variantMutationLockRef.current || isVariantMutationPending) return;
    setEditingVariantId(variant.id);
    setEditVariantName(variant.variantName);
    setEditSku(variant.sku ?? "");
    setEditPriceNote(variant.priceNote ?? "");
    clearVariantFeedback();
  }

  function handleEditCancel() {
    if (variantMutationLockRef.current || isVariantMutationPending) return;
    setEditingVariantId(null);
    setEditError(null);
  }

  function handleEditSubmit(e: React.FormEvent, variantId: string) {
    e.preventDefault();
    if (variantMutationLockRef.current) return;
    variantMutationLockRef.current = true;
    clearVariantFeedback();

    startEditTransition(async () => {
      try {
        const result = await updateProductVariantAction({
          productId,
          variantId,
          variantName: editVariantName,
          sku: editSku,
          priceNote: editPriceNote,
        });

        if (result.error) {
          setEditError(result.error);
          return;
        }

        if (!result.variant) {
          setEditError(
            "The variant may have been updated, but its confirmation could not be verified. Please refresh the product list before trying again."
          );
          return;
        }

        const confirmedVariant = result.variant;
        setVariants((prev) => prev.map((v) => (v.id === variantId ? confirmedVariant : v)));
        setEditingVariantId(null);
        setEditSuccess("Variant updated.");
      } finally {
        variantMutationLockRef.current = false;
      }
    });
  }

  function handleDeleteClick(variantId: string) {
    if (variantMutationLockRef.current) return;
    variantMutationLockRef.current = true;
    clearVariantFeedback();
    setDeletingVariantId(variantId);

    startDeleteTransition(async () => {
      try {
        const result = await deleteProductVariantAction({ productId, variantId });

        if (result.error) {
          setDeleteError(result.error);
          setDeletingVariantId(null);
          return;
        }

        if (!result.productId) {
          setDeleteError(
            "The variant may have been deleted, but its confirmation could not be verified. Please refresh the product list before trying again."
          );
          setDeletingVariantId(null);
          return;
        }

        setVariants((prev) => prev.filter((v) => v.id !== variantId));
        setDeletingVariantId(null);
        setDeleteSuccess("Variant deleted.");
      } finally {
        variantMutationLockRef.current = false;
      }
    });
  }

  function handleCollectionToggle(collectionId: string, isChecked: boolean) {
    if (collectionMutationLockRef.current) return;
    collectionMutationLockRef.current = true;
    setCollectionError(null);
    setCollectionSuccess(null);
    setPendingCollectionId(collectionId);

    startCollectionTransition(async () => {
      try {
        if (isChecked) {
          const result = await assignProductCollectionAction({ productId, collectionId });

          if (result.error) {
            setCollectionError(result.error);
            return;
          }

          setAssignedCollectionIds((prev) => (prev.includes(collectionId) ? prev : [...prev, collectionId]));
          setCollectionSuccess("Collection assigned.");
        } else {
          const result = await unassignProductCollectionAction({ productId, collectionId });

          if (result.error) {
            setCollectionError(result.error);
            return;
          }

          setAssignedCollectionIds((prev) => prev.filter((id) => id !== collectionId));
          setCollectionSuccess("Collection removed.");
        }
      } finally {
        collectionMutationLockRef.current = false;
        setPendingCollectionId(null);
      }
    });
  }

  return (
    <div className="mt-3 space-y-4 border-t border-gray-200 pt-3">
      <div>
        <h4 className="text-sm font-medium text-gray-700">Variants</h4>

        {variants.length === 0 && (
          <p className="mt-1 text-sm text-gray-500">No variants yet.</p>
        )}

        <div className="mt-2 space-y-2">
          {variants.map((variant) => (
            <div key={variant.id} className="rounded-md border border-gray-200 p-3">
              {editingVariantId === variant.id ? (
                <form onSubmit={(e) => handleEditSubmit(e, variant.id)} className="space-y-2">
                  <FormError message={editError} />
                  <div>
                    <Label htmlFor={`variant-name-${variant.id}`}>Variant name</Label>
                    <Input
                      id={`variant-name-${variant.id}`}
                      value={editVariantName}
                      onChange={(e) => { setEditSuccess(null); setEditVariantName(e.target.value); }}
                      disabled={isVariantMutationPending}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`variant-sku-${variant.id}`}>SKU</Label>
                    <Input
                      id={`variant-sku-${variant.id}`}
                      value={editSku}
                      onChange={(e) => { setEditSuccess(null); setEditSku(e.target.value); }}
                      disabled={isVariantMutationPending}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`variant-price-note-${variant.id}`}>Price note</Label>
                    <Input
                      id={`variant-price-note-${variant.id}`}
                      value={editPriceNote}
                      onChange={(e) => { setEditSuccess(null); setEditPriceNote(e.target.value); }}
                      disabled={isVariantMutationPending}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={isVariantMutationPending}>
                      {isSavingEdit ? "Saving\u2026" : "Save Changes"}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleEditCancel} disabled={isVariantMutationPending}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="font-medium">{variant.variantName}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {variant.sku ?? "No SKU"} · {variant.priceNote ?? "No price note"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleEditClick(variant)}
                      disabled={isVariantMutationPending}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleDeleteClick(variant.id)}
                      disabled={isVariantMutationPending}
                    >
                      {isDeleting && deletingVariantId === variant.id ? "Deleting\u2026" : "Delete"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <FormError message={deleteError} />
        <FormSuccess message={deleteSuccess} />
        <FormSuccess message={editSuccess} />

        <form onSubmit={handleCreateSubmit} className="mt-3 space-y-2 rounded-md border border-gray-200 p-3">
          <h5 className="text-sm font-medium text-gray-700">Add variant</h5>
          <FormError message={createError} />
          <FormSuccess message={createSuccess} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <Label htmlFor={`new-variant-name-${productId}`}>Variant name</Label>
              <Input
                id={`new-variant-name-${productId}`}
                value={newVariantName}
                onChange={(e) => { setCreateSuccess(null); setNewVariantName(e.target.value); }}
                disabled={isVariantMutationPending}
                required
              />
            </div>
            <div>
              <Label htmlFor={`new-variant-sku-${productId}`}>SKU</Label>
              <Input
                id={`new-variant-sku-${productId}`}
                value={newSku}
                onChange={(e) => { setCreateSuccess(null); setNewSku(e.target.value); }}
                disabled={isVariantMutationPending}
              />
            </div>
            <div>
              <Label htmlFor={`new-variant-price-note-${productId}`}>Price note</Label>
              <Input
                id={`new-variant-price-note-${productId}`}
                value={newPriceNote}
                onChange={(e) => { setCreateSuccess(null); setNewPriceNote(e.target.value); }}
                disabled={isVariantMutationPending}
              />
            </div>
          </div>
          <Button type="submit" disabled={isVariantMutationPending}>
            {isCreating ? "Adding\u2026" : "Add Variant"}
          </Button>
        </form>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700">Collections</h4>

        <FormError message={collectionError} />
        <FormSuccess message={collectionSuccess} />

        {collections.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">No collections available.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-3">
            {collections.map((collection) => {
              const isChecked = assignedCollectionIds.includes(collection.id);
              return (
                <label key={collection.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isTogglingCollection}
                    onChange={(e) => handleCollectionToggle(collection.id, e.target.checked)}
                  />
                  {collection.name}
                  {isTogglingCollection && pendingCollectionId === collection.id ? " (updating\u2026)" : ""}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}