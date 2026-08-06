"use client";

import { createContext, startTransition, useContext, useEffect, useState, type ReactNode } from "react";
import {
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  type ConsentDecision,
  makeConsentDecision,
  parseConsentCookie,
  serializeConsentCookie,
} from "@/lib/consent/consent";

interface ConsentContextValue {
  decision: ConsentDecision | null;
  /** False until the client-side cookie read has actually happened. */
  hasChecked: boolean;
  setDecision: (marketing: boolean) => void;
}

/**
 * One combined snapshot — a single state value, not two independently
 * updated ones — so the mount-time cookie check is a single setState
 * call, not two.
 */
interface ConsentSnapshot {
  hasChecked: boolean;
  decision: ConsentDecision | null;
}

const INITIAL_SNAPSHOT: ConsentSnapshot = { hasChecked: false, decision: null };

const ConsentContext = createContext<ConsentContextValue | null>(null);

function readConsentCookie(): ConsentDecision | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE_NAME}=([^;]*)`));
  return parseConsentCookie(match?.[1]);
}

/**
 * One shared consent state for the whole marketing subtree — mounted
 * once in the (marketing) layout, so ConsentBanner and
 * ConsentPreferences read and write the SAME state via context, not
 * independent per-component hooks.
 *
 * The initial render (both server and the first client render, before
 * this component's effect has run) always reflects INITIAL_SNAPSHOT —
 * denied/unset, hasChecked: false — so there is nothing for React to
 * mismatch during hydration. The effect below then performs the actual
 * cookie read exactly once on mount and applies it as a single combined
 * update, wrapped in startTransition so it is not treated as an urgent
 * synchronous effect update; this is purely the passive "find out what
 * the visitor already decided" step, not a response to a user action.
 *
 * setDecision() (the button-click path) is deliberately NOT wrapped in
 * startTransition — a direct user action should update immediately, not
 * be deferred.
 */
export function ConsentProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ConsentSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    const initialDecision = readConsentCookie();
    startTransition(() => {
      setSnapshot({ hasChecked: true, decision: initialDecision });
    });
  }, []);

  function setDecision(marketing: boolean) {
    const next = makeConsentDecision(marketing);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE_NAME}=${serializeConsentCookie(next)}; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    setSnapshot({ hasChecked: true, decision: next });
  }

  return (
    <ConsentContext.Provider
      value={{ decision: snapshot.decision, hasChecked: snapshot.hasChecked, setDecision }}
    >
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent() must be used within a ConsentProvider");
  return ctx;
}