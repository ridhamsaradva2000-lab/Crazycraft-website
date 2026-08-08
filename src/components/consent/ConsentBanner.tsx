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

    // Native close-request hardening. `closedby="none"` prevents browser
    // light-dismiss / Escape close behavior where supported, while the
    // native cancel listener is the compatibility fallback.
    dialog.setAttribute("closedby", "none");

    const preventCancel = (event: Event) => {
      event.preventDefault();
    };

    dialog.addEventListener("cancel", preventCancel);

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
      dialog.removeEventListener("cancel", preventCancel);

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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[40rem] overflow-y-auto rounded-[1.75rem] border border-paper-muted bg-white p-0 text-ink shadow-[0_28px_80px_rgba(7,36,58,0.24)] backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5 sm:p-9">
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-paper-muted bg-brand-50 text-xl shadow-sm sm:h-14 sm:w-14 sm:rounded-2xl sm:text-3xl"
          >
            {"\u{1F36A}"}
          </div>

          <div className="min-w-0">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Privacy preferences
            </p>
            <h2
              id="cookie-consent-title"
              className="mt-1 font-heading text-xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl"
            >
              Get a Better Experience
            </h2>
          </div>
        </div>

        <p
          id="cookie-consent-description"
          className="mt-5 font-body text-sm leading-6 text-ink-muted sm:mt-6 sm:text-base sm:leading-7"
        >
          Enable optional cookies to discover more relevant products and enjoy a more personalized
          sourcing experience.
        </p>

        <div className="mt-4 rounded-xl border border-brand-700/15 bg-brand-50 px-4 py-3 sm:mt-5 sm:px-5 sm:py-3.5">
          <ul id="cookie-consent-privacy" className="space-y-2">
            <li className="flex items-start gap-3 font-body text-sm font-medium leading-5 text-ink">
              <span
                aria-hidden="true"
                className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-700"
              />
              <span>Your privacy matters. We never sell your information.</span>
            </li>
            <li className="flex items-start gap-3 font-body text-sm font-medium leading-5 text-ink">
              <span
                aria-hidden="true"
                className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-700"
              />
              <span>Change your preferences anytime from Privacy &amp; Cookies.</span>
            </li>
          </ul>
        </div>

        <p
          id="cookie-consent-choice"
          className="mt-4 font-body text-sm font-medium text-ink sm:mt-5"
        >
          Choose an option to continue.
        </p>

        <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="order-2 min-h-11 w-full rounded-lg sm:order-1 sm:min-h-12 sm:flex-1"
            onClick={() => setDecision(false)}
          >
            Reject Non-Essential Cookies
          </Button>
          <Button
            type="button"
            variant="outline"
            className="order-1 min-h-11 w-full rounded-lg sm:order-2 sm:min-h-12 sm:flex-1"
            onClick={() => setDecision(true)}
          >
            Accept Cookies
          </Button>
        </div>
      </div>
    </dialog>
  );
}
