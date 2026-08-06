"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Script from "next/script";
import { clientEnv } from "@/lib/env.client";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export interface TurnstileWidgetHandle {
  /**
   * Resets the Cloudflare widget itself (forcing a fresh challenge/token),
   * separate from whatever the parent form does with its own token state.
   * Call this any time a previously-verified token turns out to be unusable
   * — e.g. the server action returned an error — since a Turnstile token
   * is single-use and must never be silently resubmitted on retry.
   */
  reset: () => void;
}

/**
 * Renders the Cloudflare Turnstile widget and reports the resulting
 * token via onVerify. The API script is loaded with a fixed id
 * ("cloudflare-turnstile-script") — next/script dedupes by id across the
 * whole app, so even if this component were used in more than one place
 * simultaneously, the script tag itself is only ever injected once. The
 * script URL includes ?render=explicit specifically so Cloudflare's own
 * script never attempts implicit auto-rendering (scanning the page for
 * cf-turnstile-classed elements) — this component always renders via the
 * imperative API below, and implicit scanning running alongside that
 * could double-render or otherwise conflict with it.
 *
 * `action` is passed straight to Turnstile's render() call and is
 * reflected back in Cloudflare's siteverify response. The server verifies
 * it matches what THIS specific form expects (see verifyTurnstileToken's
 * expectedAction option) — this is what stops a token issued for a
 * different Turnstile widget on the same host (e.g. a future login-form
 * widget) from being replayed against this one; hostname verification
 * alone can't catch that, since both widgets would share the same host.
 *
 * Uses the imperative render() API rather than the implicit
 * (data-sitekey div-scanning) approach, since that gives explicit control
 * over the widget id for cleanup on unmount and avoids any ambiguity
 * about which div the auto-scanner picks up if the form re-renders.
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, { onVerify: (token: string) => void; onExpire?: () => void; action: string }>(
  function TurnstileWidget({ onVerify, onExpire, action }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [scriptLoaded, setScriptLoaded] = useState(false);

    const renderWidget = useCallback(() => {
      if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        action,
        callback: (token: string) => onVerify(token),
        "expired-callback": () => onExpire?.(),
        "error-callback": () => onExpire?.(),
      });
    }, [onVerify, onExpire, action]);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
          }
        },
      }),
      []
    );

    // Covers the case where the script was already loaded by an earlier
    // mount of this component (e.g. client-side navigation away and back).
    useEffect(() => {
      if (window.turnstile) {
        renderWidget();
      }
    }, [renderWidget]);

    // Covers the case where THIS mount is the one that triggers the load.
    useEffect(() => {
      if (scriptLoaded) {
        renderWidget();
      }
    }, [scriptLoaded, renderWidget]);

    // Cleanup on unmount only — intentionally separate from the effects
    // above so it doesn't re-run (and incorrectly remove a freshly-rendered
    // widget) every time scriptLoaded/renderWidget change.
    useEffect(() => {
      return () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, []);

    return (
      <>
        <Script
          id="cloudflare-turnstile-script"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
        />
        <div ref={containerRef} />
      </>
    );
  }
);
