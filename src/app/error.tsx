"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-boundary]", { name: error.name, digest: error.digest ?? null });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-body text-ink">Something went wrong loading this page.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-paper-muted px-4 py-2 font-body text-ink hover:bg-paper-muted"
      >
        Try again
      </button>
    </div>
  );
}