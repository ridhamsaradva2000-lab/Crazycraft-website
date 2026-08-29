"use client";

import { useState, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  prepareProductImageUploadAction,
  finalizeProductImageUploadAction,
  updateProductImageAltTextAction,
  setProductImagePrimaryAction,
  moveProductImageAction,
  removeProductImageAction,
} from "@/lib/catalog/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FormError, FormSuccess } from "@/components/ui/FormError";

interface AdminProductImagesImage {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
}

interface AdminProductImagesProps {
  productId: string;
  initialImages: AdminProductImagesImage[];
}

type ActiveImageOperation =
  | null
  | { type: "upload" }
  | { type: "altSave"; imageId: string }
  | { type: "setPrimary"; imageId: string }
  | { type: "move"; imageId: string; direction: "up" | "down" }
  | { type: "remove"; imageId: string };

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function AdminProductImages({ productId, initialImages }: AdminProductImagesProps) {
  const [images, setImages] = useState<AdminProductImagesImage[]>(initialImages);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const image of initialImages) {
      initial[image.id] = image.altText;
    }
    return initial;
  });

  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSuccess, setImageSuccess] = useState<string | null>(null);
  const [isMutatingImages, startImageMutationTransition] = useTransition();
  const imageMutationLockRef = useRef(false);
  const [activeOperation, setActiveOperation] = useState<ActiveImageOperation>(null);

  const imageControlsDisabled = isMutatingImages || activeOperation !== null;

  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [uploadAltText, setUploadAltText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasPrimary = images.some((image) => image.isPrimary);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
    setSelectedFileName(file ? file.name : null);
    setImageSuccess(null);
  }

  function handleAltDraftChange(imageId: string, value: string) {
    setImageSuccess(null);
    setAltDrafts((prev) => ({ ...prev, [imageId]: value }));
  }

  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (imageMutationLockRef.current) return;

    const file = fileInputRef.current && fileInputRef.current.files ? fileInputRef.current.files[0] : undefined;

    if (!file) {
      setImageError("Please choose an image to upload.");
      return;
    }

    if (ALLOWED_IMAGE_MIME_TYPES.indexOf(file.type) === -1) {
      setImageError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size <= 0) {
      setImageError("That file appears to be empty. Please choose a different image.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Image must be 10 MiB or smaller.");
      return;
    }

    const narrowedMimeType = file.type as "image/jpeg" | "image/png" | "image/webp";

    imageMutationLockRef.current = true;
    setImageError(null);
    setImageSuccess(null);
    setActiveOperation({ type: "upload" });

    startImageMutationTransition(async () => {
      try {
        const prepareResult = await prepareProductImageUploadAction({
          productId,
          declaredMimeType: narrowedMimeType,
          declaredFileSize: file.size,
        });

        if (prepareResult.error || !prepareResult.upload) {
          setImageError(prepareResult.error ?? "Something went wrong preparing this upload. Please try again.");
          return;
        }

        const { objectPath, token } = prepareResult.upload;

        const supabase = createClient();

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .uploadToSignedUrl(objectPath, token, file, {
            contentType: file.type,
            cacheControl: "3600",
          });

        if (uploadError) {
          setImageError("Something went wrong uploading this image. Please try again.");
          return;
        }

        const finalizeResult = await finalizeProductImageUploadAction({
          productId,
          objectPath,
          declaredMimeType: narrowedMimeType,
          altText: uploadAltText,
        });

        if (finalizeResult.error || !finalizeResult.image) {
          setImageError(finalizeResult.error ?? "Something went wrong finishing this upload. Please try again.");
          return;
        }

        const confirmedImage = finalizeResult.image;
        setImages((prev) => [...prev, confirmedImage]);
        setAltDrafts((prev) => ({ ...prev, [confirmedImage.id]: confirmedImage.altText }));
        setUploadAltText("");
        setSelectedFileName(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setImageSuccess("Image uploaded.");
      } catch {
        setImageError("Something went wrong uploading this image. Please try again.");
      } finally {
        imageMutationLockRef.current = false;
        setActiveOperation(null);
      }
    });
  }

  function handleAltSave(imageId: string) {
    if (imageMutationLockRef.current) return;
    imageMutationLockRef.current = true;
    setImageError(null);
    setImageSuccess(null);
    setActiveOperation({ type: "altSave", imageId });

    startImageMutationTransition(async () => {
      try {
        const result = await updateProductImageAltTextAction({
          productId,
          imageId,
          altText: altDrafts[imageId] ?? "",
        });

        if (result.error || !result.image) {
          setImageError(result.error ?? "Something went wrong updating this image. Please try again.");
          return;
        }

        const confirmedImage = result.image;
        setImages((prev) => prev.map((image) => (image.id === imageId ? confirmedImage : image)));
        setAltDrafts((prev) => ({ ...prev, [imageId]: confirmedImage.altText }));
        setImageSuccess("Alt text updated.");
      } catch {
        setImageError("Something went wrong updating this image. Please try again.");
      } finally {
        imageMutationLockRef.current = false;
        setActiveOperation(null);
      }
    });
  }

  function handleSetPrimary(imageId: string) {
    if (imageMutationLockRef.current) return;
    imageMutationLockRef.current = true;
    setImageError(null);
    setImageSuccess(null);
    setActiveOperation({ type: "setPrimary", imageId });

    startImageMutationTransition(async () => {
      try {
        const result = await setProductImagePrimaryAction({ productId, imageId });

        if (result.error || !result.image) {
          setImageError(result.error ?? "Something went wrong updating the primary image. Please try again.");
          return;
        }

        const confirmedImage = result.image;
        setImages((prev) =>
          prev.map((image) => (image.id === confirmedImage.id ? confirmedImage : { ...image, isPrimary: false }))
        );
        setImageSuccess("Primary image updated.");
      } catch {
        setImageError("Something went wrong updating the primary image. Please try again.");
      } finally {
        imageMutationLockRef.current = false;
        setActiveOperation(null);
      }
    });
  }

  function handleMove(imageId: string, direction: "up" | "down") {
    if (imageMutationLockRef.current) return;
    imageMutationLockRef.current = true;
    setImageError(null);
    setImageSuccess(null);
    setActiveOperation({ type: "move", imageId, direction });

    startImageMutationTransition(async () => {
      try {
        const result = await moveProductImageAction({ productId, imageId, direction });

        if (result.images) {
          setImages(result.images);
          setAltDrafts((prev) => {
            const next: Record<string, string> = {};
            for (const image of result.images as AdminProductImagesImage[]) {
              next[image.id] = prev[image.id] ?? image.altText;
            }
            return next;
          });
        }

        if (result.error) {
          setImageError(result.error);
          return;
        }

        setImageSuccess("Image order updated.");
      } catch {
        setImageError("Something went wrong reordering the images. Please try again.");
      } finally {
        imageMutationLockRef.current = false;
        setActiveOperation(null);
      }
    });
  }

  function handleRemove(imageId: string) {
    if (imageMutationLockRef.current) return;
    imageMutationLockRef.current = true;
    setImageError(null);
    setImageSuccess(null);
    setActiveOperation({ type: "remove", imageId });

    startImageMutationTransition(async () => {
      try {
        const result = await removeProductImageAction({ productId, imageId });

        if (result.error) {
          setImageError(result.error);
          return;
        }

        const removedId = result.removedImageId ?? imageId;
        setImages((prev) => prev.filter((image) => image.id !== removedId));
        setAltDrafts((prev) => {
          const next = { ...prev };
          delete next[removedId];
          return next;
        });
        setImageSuccess("Image removed.");
      } catch {
        setImageError("Something went wrong removing this image. Please try again.");
      } finally {
        imageMutationLockRef.current = false;
        setActiveOperation(null);
      }
    });
  }

  return (
    <div className="mt-3 space-y-4 border-t border-gray-200 pt-3">
      <div>
        <h4 className="text-sm font-medium text-gray-700">Product Images</h4>

        <FormError message={imageError} />
        <FormSuccess message={imageSuccess} />

        {images.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">No product images yet.</p>
        ) : (
          <>
            {!hasPrimary && (
              <p className="mt-1 text-sm text-yellow-700">No primary image selected.</p>
            )}
            <div className="mt-2 space-y-2">
              {images.map((image, index) => (
                <div
                  key={image.id}
                  className="flex flex-col gap-2 rounded-md border border-gray-200 p-3 sm:flex-row sm:items-start"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.altText}
                    className="h-24 w-24 flex-shrink-0 rounded-md border border-gray-200 object-cover"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {image.isPrimary && (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          Primary
                        </span>
                      )}
                      <span className="text-xs text-gray-500">Position {index + 1}</span>
                    </div>
                    <div>
                      <Label htmlFor={`image-alt-${image.id}`}>Alt text</Label>
                      <Input
                        id={`image-alt-${image.id}`}
                        value={altDrafts[image.id] ?? ""}
                        onChange={(e) => handleAltDraftChange(image.id, e.target.value)}
                        disabled={imageControlsDisabled}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => handleAltSave(image.id)} disabled={imageControlsDisabled}>
                        {activeOperation && activeOperation.type === "altSave" && activeOperation.imageId === image.id
                          ? "Saving\u2026"
                          : "Save Alt"}
                      </Button>
                      {!image.isPrimary && (
                        <Button type="button" variant="outline" onClick={() => handleSetPrimary(image.id)} disabled={imageControlsDisabled}>
                          {activeOperation && activeOperation.type === "setPrimary" && activeOperation.imageId === image.id
                            ? "Setting\u2026"
                            : "Set Primary"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleMove(image.id, "up")}
                        disabled={imageControlsDisabled || index === 0}
                      >
                        {activeOperation && activeOperation.type === "move" && activeOperation.imageId === image.id && activeOperation.direction === "up"
                          ? "Moving\u2026"
                          : "Move Up"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleMove(image.id, "down")}
                        disabled={imageControlsDisabled || index === images.length - 1}
                      >
                        {activeOperation && activeOperation.type === "move" && activeOperation.imageId === image.id && activeOperation.direction === "down"
                          ? "Moving\u2026"
                          : "Move Down"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => handleRemove(image.id)} disabled={imageControlsDisabled}>
                        {activeOperation && activeOperation.type === "remove" && activeOperation.imageId === image.id
                          ? "Removing\u2026"
                          : "Remove"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <form onSubmit={handleUploadSubmit} className="mt-3 space-y-2 rounded-md border border-gray-200 p-3">
          <h5 className="text-sm font-medium text-gray-700">Upload Image</h5>
          <div>
            <Label htmlFor={`image-file-${productId}`}>Image file</Label>
            <input
              id={`image-file-${productId}`}
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={imageControlsDisabled}
            />
            {selectedFileName && (
              <p className="mt-1 text-xs text-gray-500">Selected: {selectedFileName}</p>
            )}
          </div>
          <div>
            <Label htmlFor={`image-alt-upload-${productId}`}>Alt text (optional)</Label>
            <Input
              id={`image-alt-upload-${productId}`}
              value={uploadAltText}
              onChange={(e) => { setImageSuccess(null); setUploadAltText(e.target.value); }}
              disabled={imageControlsDisabled}
            />
          </div>
          <p className="text-xs text-gray-500">
            JPEG, PNG or WebP. Maximum 10 MiB. Minimum final validated dimensions 1600 x 1600; 2000 x 2000 or larger recommended.
          </p>
          <Button type="submit" disabled={imageControlsDisabled}>
            {activeOperation && activeOperation.type === "upload" ? "Uploading\u2026" : "Upload Image"}
          </Button>
        </form>
      </div>
    </div>
  );
}