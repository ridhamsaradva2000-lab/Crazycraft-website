"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { NAV_LINKS } from "@/lib/constants";
import type { CategoryOption } from "@/lib/catalog/data";

export function MobileMenu({
  categories,
  isLoggedIn,
  accountHref,
}: {
  categories: CategoryOption[];
  isLoggedIn: boolean;
  accountHref: Route;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape-to-close, and body-scroll lock while the panel is open — both
  // only ever attached/active while isOpen is true, and always cleaned
  // up on close/unmount so they never leak into the rest of the page.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // Move focus into the open panel for keyboard users.
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-paper-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {isOpen && (
        <div
          id={panelId}
          ref={panelRef}
          className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-white"
        >
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1 p-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href as Route}
                onClick={() => setIsOpen(false)}
                className="rounded-md px-3 py-3 font-body text-base text-ink hover:bg-paper-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                {link.label}
              </Link>
            ))}

            {categories.length > 0 && (
              <div className="mt-2 border-t border-paper-muted pt-2">
                <p className="px-3 py-1 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Categories
                </p>
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/categories/${category.slug}` as Route}
                    onClick={() => setIsOpen(false)}
                    className="block rounded-md px-3 py-2 font-body text-sm text-ink-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 border-t border-paper-muted pt-4">
              <Link
                href={"/contact" as Route}
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-brand-700 px-4 py-3 text-center font-body text-sm font-medium text-white hover:bg-brand-900"
              >
                Request Quote
              </Link>
              <Link
                href={accountHref}
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-paper-muted px-4 py-3 text-center font-body text-sm text-ink hover:bg-paper-muted"
              >
                {isLoggedIn ? "My Account" : "Buyer Login"}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
