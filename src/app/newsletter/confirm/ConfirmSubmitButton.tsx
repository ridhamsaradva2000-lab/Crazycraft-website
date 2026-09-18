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
      className="inline-flex w-full items-center justify-center rounded-md bg-brand-900 px-8 py-3.5 font-body text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:px-10"
    >
      {pending ? "Confirming…" : "Confirm Subscription"}
    </button>
  );
}