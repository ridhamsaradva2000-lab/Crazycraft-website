"use client";

import { useSyncExternalStore } from "react";

/**
 * This component has no changing external subscription. `useSyncExternalStore`
 * is used only to provide an empty server snapshot and a browser-local client
 * snapshot without setting React state inside an effect.
 */
const subscribe = () => () => {};

function formatLocalDate(iso: string, mode: "date" | "datetime") {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return mode === "date" ? date.toLocaleDateString() : date.toLocaleString();
}

/**
 * Renders a stored UTC ISO timestamp in the viewing browser's local timezone.
 * The server snapshot is deliberately empty, preventing server-timezone output
 * and hydration mismatches. The stored value itself remains unchanged UTC ISO.
 */
export function LocalDateTime({
  iso,
  mode = "datetime",
}: {
  iso: string;
  /** "date" for a date-only display, "datetime" for date + time. */
  mode?: "date" | "datetime";
}) {
  const formatted = useSyncExternalStore(
    subscribe,
    () => formatLocalDate(iso, mode),
    () => "",
  );

  return <span>{formatted}</span>;
}
