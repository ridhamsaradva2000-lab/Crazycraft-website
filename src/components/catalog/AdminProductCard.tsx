"use client";

import { useState, useRef, useTransition } from "react";
import type { ComponentProps } from "react";
import { deleteProductAction } from "@/lib/catalog/actions";
import { AdminProductEditableRow } from "@/components/catalog/AdminProductEditableRow";
import { AdminProductVariantsCollections } from "@/components/catalog/AdminProductVariantsCollections";
import { AdminProductImages } from "@/components/catalog/AdminProductImages";
import { Button } from "@/components/ui/Button";
import { FormError, FormSuccess } from "@/components/ui/FormError";

type AdminProductEditableRowProps = ComponentProps<typeof AdminProductEditableRow>;
type AdminProductVariantsCollectionsProps = ComponentProps<typeof AdminProductVariantsCollections>;
type AdminProductImagesProps = ComponentProps<typeof AdminProductImages>;

interface AdminProductCardProps {
  productId: string;
  productName: string;
  editableRowProps: AdminProductEditableRowProps;
  variantsCollectionsProps: AdminProductVariantsCollectionsProps;
  imagesProps: AdminProductImagesProps;
}

export function AdminProductCard({
  productId,
  productName,
  editableRowProps,
  variantsCollectionsProps,
  imagesProps,
}: AdminProductCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const deleteMutationLockRef = useRef(false);

  const deleteControlsDisabled = isDeleting;

  function handleDeleteClick() {
    if (deleteMutationLockRef.current) return;
    setDeleteError(null);
    setIsConfirming(true);
  }

  function handleCancelClick() {
    if (deleteMutationLockRef.current) return;
    setIsConfirming(false);
    setDeleteError(null);
  }

  function handleConfirmDelete() {
    if (deleteMutationLockRef.current) return;
    deleteMutationLockRef.current = true;
    setDeleteError(null);
    setDeleteWarning(null);

    startDeleteTransition(async () => {
      try {
        const result = await deleteProductAction({ productId });

        if (result.error) {
          setDeleteError(result.error);
          return;
        }

        if (result.warning) {
          setDeleteWarning(result.warning);
        }

        setIsConfirming(false);
        setIsDeleted(true);
      } catch {
        setDeleteError("Something went wrong deleting this product. Please try again.");
      } finally {
        deleteMutationLockRef.current = false;
      }
    });
  }

  if (isDeleted) {
    return (
      <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-4">
        <FormSuccess message="Product deleted." />
        {deleteWarning && (
          <p className="text-sm text-yellow-700">{deleteWarning}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AdminProductEditableRow {...editableRowProps} />
      <AdminProductVariantsCollections {...variantsCollectionsProps} />
      <AdminProductImages {...imagesProps} />

      <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
        <h4 className="text-sm font-medium text-gray-700">Delete Product</h4>
        <FormError message={deleteError} />
        {!isConfirming ? (
          <Button type="button" variant="outline" onClick={handleDeleteClick} disabled={deleteControlsDisabled}>
            Delete Product
          </Button>
        ) : (
          <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              Are you sure you want to delete &quot;{productName}&quot;? This cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={handleConfirmDelete} disabled={deleteControlsDisabled}>
                {isDeleting ? "Deleting\u2026" : "Confirm Delete"}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancelClick} disabled={deleteControlsDisabled}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}