"use client";

import { useFormStatus } from "react-dom";

// Reads the pending state of the ambient parent <form> -- does NOT wrap,
// intercept, or modify the server action itself. confirmNewsletterSubscription
// in ./actions.ts is completely unchanged; this component is purely
// presentational.
export function ConfirmSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-md bg-brand-900 px-7 py-3 font-body text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 sm:px-9 sm:py-3.5"
    >
      {pending ? "Confirming…" : "Confirm Subscription"}
    </button>
  );
}