"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { useConsent } from "@/lib/consent/ConsentProvider";

const CONSENT_PROMPT_DELAY_MS = 10_000;

export function ConsentBanner() {
  const { decision, hasChecked, setDecision } = useConsent();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!hasChecked || decision !== null) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;

    const timer = window.setTimeout(() => {
      if (dialog.open) return;

      dialog.showModal();
      root.style.overflow = "hidden";
      dialog.focus();
    }, CONSENT_PROMPT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);

      if (dialog.open) dialog.close();

      root.style.overflow = previousOverflow;
    };
  }, [hasChecked, decision]);

  if (!hasChecked || decision !== null) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description cookie-consent-privacy cookie-consent-choice"
      onCancel={(event) => event.preventDefault()}
      tabIndex={-1}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-paper-muted bg-white p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[1px]"
    >
      <div className="p-6 sm:p-8">
        <h2
          id="cookie-consent-title"
          className="font-heading text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
        >
          <span aria-hidden="true">{"\u{1F36A}"}</span> Get a Better Experience
        </h2>

        <p
          id="cookie-consent-description"
          className="mt-4 font-body text-sm leading-6 text-ink-muted sm:text-base"
        >
          Enable optional cookies to discover more relevant products and enjoy a more personalized
          sourcing experience.
        </p>

        <p
          id="cookie-consent-privacy"
          className="mt-3 font-body text-sm leading-6 text-ink-muted sm:text-base"
        >
          We value your privacy. Your information is handled securely and is never sold.
        </p>

        <p
          id="cookie-consent-choice"
          className="mt-4 font-body text-sm font-medium italic text-ink"
        >
          Choose an option to continue.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:flex-1"
            onClick={() => setDecision(false)}
          >
            Reject Non-Essential Cookies
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:flex-1"
            onClick={() => setDecision(true)}
          >
            Accept Cookies
          </Button>
        </div>
      </div>
    </dialog>
  );
}
