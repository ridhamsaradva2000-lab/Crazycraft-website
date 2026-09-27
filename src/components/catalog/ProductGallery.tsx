"use client";

import { useRef, useState } from "react";
import Image from "next/image";

interface GalleryImage {
  url: string;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
}

interface ProductGalleryProps {
  images: GalleryImage[];
}

const SWIPE_THRESHOLD_PX = 50;

export function ProductGallery({ images }: ProductGalleryProps) {
  const initialIndex = (() => {
    const primaryIndex = images.findIndex((image) => image.isPrimary);
    return primaryIndex >= 0 ? primaryIndex : 0;
  })();

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  if (images.length === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-paper-muted">
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center font-body text-sm text-ink-muted"
        >
          Image coming soon
        </div>
      </div>
    );
  }

  const selectedImage = images[selectedIndex] ?? images[0]!;

  function goToPrevious() {
    setSelectedIndex((current) => (current > 0 ? current - 1 : current));
  }

  function goToNext() {
    setSelectedIndex((current) => (current < images.length - 1 ? current + 1 : current));
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (images.length <= 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (images.length <= 1) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    const isClearlyHorizontal =
      Math.abs(deltaX) >= SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);
    if (!isClearlyHorizontal) return;

    if (deltaX < 0) {
      goToNext();
    } else {
      goToPrevious();
    }
  }

  function handleTouchCancel() {
    touchStartRef.current = null;
  }

  return (
    <div>
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg bg-paper-muted"
        style={{ touchAction: "pan-y" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <Image
          key={selectedImage.url}
          src={selectedImage.url}
          alt={selectedImage.altText}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>

      {images.length > 1 ? (
        <ul className="mt-3 grid grid-cols-5 gap-2">
          {images.map((image, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li key={image.url}>
                <button
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  aria-label={`Show image ${index + 1} of ${images.length}: ${image.altText}`}
                  aria-pressed={isSelected}
                  className={[
                    "relative aspect-square w-full overflow-hidden rounded-md bg-paper-muted",
                    isSelected ? "ring-2 ring-brand-700 ring-offset-1" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Image src={image.url} alt={image.altText} fill sizes="20vw" className="object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
