"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useConsent } from "@/lib/consent/ConsentProvider";
import { clientEnv } from "@/lib/env.client";

function isValidPixelId(id: string | undefined): id is string {
  return typeof id === "string" && /^\d{9,20}$/.test(id);
}

interface FbqFunction {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: FbqFunction;
  loaded: boolean;
  version: string;
  /** Set only on the stub THIS integration creates — the single, authoritative
   *  ownership marker, never true on any function we didn't build. */
  __crazycraftOwned?: true;
}

type ScriptStatus = "idle" | "loading" | "loaded" | "failed";

/**
 * All mutable Pixel state lives on `window` — genuinely global, so it
 * survives React Strict Mode's dev-only unmount/remount cycle and
 * component remounts from leaving/returning to the marketing route
 * group within the same page session.
 *
 * desiredUrlKey and the value flushIfReady() compares it against are
 * BOTH produced by the same getCurrentUrlKey() function — reading
 * window.location directly, not the React-router-derived
 * usePathname()/useSearchParams() string. Those two sources can
 * disagree in encoding for an identical real URL (e.g. a space encoded
 * as "%20" by the browser's address bar vs "+" from
 * URLSearchParams#toString()'s own normalization) — comparing two
 * DIFFERENT canonicalizations of the same URL would incorrectly block
 * tracking on a route the visitor is genuinely, confirmedly on. Using
 * one single source for both sides of the comparison eliminates that
 * entirely; there is nothing left to normalize differently.
 */
interface MetaPixelGlobalState {
  scriptStatus: ScriptStatus;
  /** True only when THIS integration created (or verified-adopted its own) stub. */
  ownsQueue: boolean;
  /** The Pixel ID a genuine fbq('init', ...) call has actually been made with. */
  initializedPixelId: string | null;
  /** True only once a genuine fbq('consent','grant') call has actually been made. */
  consentGranted: boolean;
  desiredConsent: boolean;
  desiredPixelId: string | null;
  /** The URL the currently-mounted marketing tracking effect last confirmed (via getCurrentUrlKey()), or null. */
  desiredUrlKey: string | null;
  /**
   * The URL the most recent genuine PageView call was made for, or
   * null. Deliberately NOT a Set of every URL ever seen this session —
   * a Set would incorrectly suppress a legitimate repeat visit
   * (A -> B -> A must send three PageViews, not two).
   */
  lastTrackedUrl: string | null;
  mountCount: number;
  mountToken: number;
  /** Permanent, document-lifetime disable — identity conflict, foreign script, pre-existing global conflict, or an unconfirmable revoke. */
  permanentlyDisabled: boolean;
}

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
    __crazycraftMetaPixelState?: MetaPixelGlobalState;
  }
}

function getGlobalState(): MetaPixelGlobalState {
  if (!window.__crazycraftMetaPixelState) {
    window.__crazycraftMetaPixelState = {
      scriptStatus: "idle",
      ownsQueue: false,
      initializedPixelId: null,
      consentGranted: false,
      desiredConsent: false,
      desiredPixelId: null,
      desiredUrlKey: null,
      lastTrackedUrl: null,
      mountCount: 0,
      mountToken: 0,
      permanentlyDisabled: false,
    };
  }
  return window.__crazycraftMetaPixelState;
}

/**
 * The single canonical URL representation used EVERYWHERE in this file
 * — both when the tracking effect records what it confirmed, and when
 * flushIfReady checks the real current URL. pathname + search only;
 * window.location.hash is never read or included.
 */
function getCurrentUrlKey(): string {
  return window.location.pathname + window.location.search;
}

function getCallableFbq(): FbqFunction | null {
  return typeof window.fbq === "function" ? window.fbq : null;
}

function getOwnCallableFbq(): FbqFunction | null {
  const fbq = getCallableFbq();
  return fbq && fbq.__crazycraftOwned === true ? fbq : null;
}

/**
 * Callable, ownership-marked, AND has callMethod — meaning the real
 * fbevents.js has genuinely executed and augmented our stub in place.
 * The only check that means "a real Meta call made right now will
 * actually be delivered, not silently queued."
 */
function getOwnLoadedFbq(): FbqFunction | null {
  const fbq = getOwnCallableFbq();
  return fbq && typeof fbq.callMethod === "function" ? fbq : null;
}

const PIXEL_SCRIPT_ID = "crazycraft-meta-pixel-script";
const PIXEL_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";
const STATUS_ATTR = "data-crazycraft-pixel-status";

/**
 * The single place any fbq(...) call is ever made. The URL-confirmation
 * check runs BEFORE init, grant, or PageView — both sides of the
 * comparison come from getCurrentUrlKey(), so an identical real URL can
 * never be rejected merely due to differing encoding/normalization.
 */
function flushIfReady(state: MetaPixelGlobalState) {
  if (state.permanentlyDisabled) return;
  if (state.scriptStatus !== "loaded") return;
  if (state.mountCount <= 0) return; // no MetaPixel instance currently mounted
  if (!state.desiredConsent) return;

  if (state.desiredUrlKey === null) return;
  const actualCurrentUrl = getCurrentUrlKey();
  if (actualCurrentUrl !== state.desiredUrlKey) return; // real navigation has outpaced React — do nothing this pass

  const pixelId = state.desiredPixelId;
  if (pixelId === null) return;
  if (state.initializedPixelId !== null && state.initializedPixelId !== pixelId) return; // defensive; identity conflict handled earlier

  const fbq = getOwnLoadedFbq();
  if (!fbq) return;

  if (state.initializedPixelId === null) {
    fbq("init", pixelId);
    state.initializedPixelId = pixelId;
  }

  if (!state.consentGranted) {
    fbq("consent", "grant");
    state.consentGranted = true;
  }

  if (actualCurrentUrl !== state.lastTrackedUrl) {
    fbq("track", "PageView");
    state.lastTrackedUrl = actualCurrentUrl;
  }
}

/**
 * Ordinary consent withdrawal (unset, rejected, or leaving marketing
 * routes). consentGranted is set false ONLY after fbq('consent','revoke')
 * has genuinely been invoked through the verified loaded runtime — if
 * that can't be confirmed, this permanently disables the integration
 * instead of falsely reporting success. desiredUrlKey is always cleared.
 */
function closeConsentDesire(state: MetaPixelGlobalState) {
  state.desiredUrlKey = null;

  if (!state.consentGranted) return;

  const fbq = getOwnLoadedFbq();
  if (fbq) {
    fbq("consent", "revoke");
    state.consentGranted = false;
    state.lastTrackedUrl = null;
    return;
  }

  state.permanentlyDisabled = true;
  state.lastTrackedUrl = null;
  console.error(
    "Meta Pixel: previously granted consent could not be confirmed revoked (runtime unavailable) — tracking permanently disabled"
  );
}

function enterIdentityConflict(state: MetaPixelGlobalState) {
  closeConsentDesire(state);
  state.permanentlyDisabled = true;
  console.error("Meta Pixel: unexpected Pixel ID change detected — tracking permanently disabled for this session");
}

function enterForeignScriptConflict(state: MetaPixelGlobalState) {
  state.scriptStatus = "failed";
  state.ownsQueue = false;
  state.permanentlyDisabled = true;
  state.desiredUrlKey = null;
  console.error("Meta Pixel: an unrecognized existing fbevents.js script was found — tracking disabled to avoid calling an unrelated integration");
}

function enterPreExistingGlobalConflict(state: MetaPixelGlobalState) {
  state.scriptStatus = "failed";
  state.ownsQueue = false;
  state.permanentlyDisabled = true;
  state.desiredUrlKey = null;
  console.error("Meta Pixel: window.fbq/_fbq already existed before initialization — tracking disabled to avoid conflicting with an unrelated integration");
}

function injectOwnScript(state: MetaPixelGlobalState) {
  if (window.fbq || window._fbq) {
    enterPreExistingGlobalConflict(state);
    return;
  }

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  } as FbqFunction;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  fbq.__crazycraftOwned = true;
  window.fbq = fbq;
  window._fbq = fbq;

  function failAndCleanUp() {
    state.scriptStatus = "failed";
    state.ownsQueue = false;
    state.desiredUrlKey = null;
    state.initializedPixelId = null;
    state.consentGranted = false;
    state.lastTrackedUrl = null;
    if (typeof fbq.callMethod !== "function") {
      if (window.fbq === fbq) delete window.fbq;
      if (window._fbq === fbq) delete window._fbq;
    }
  }

  try {
    const script = document.createElement("script");
    script.id = PIXEL_SCRIPT_ID;
    script.async = true;
    script.src = PIXEL_SCRIPT_SRC; // fixed, hardcoded — no interpolation
    script.setAttribute(STATUS_ATTR, "loading");
    script.onload = () => {
      const loadedFbq = getOwnLoadedFbq();
      if (!loadedFbq) {
        script.setAttribute(STATUS_ATTR, "failed");
        state.permanentlyDisabled = true;
        failAndCleanUp();
        console.error("Meta Pixel: script reported loaded but the runtime could not be verified — tracking disabled");
        return;
      }
      state.scriptStatus = "loaded";
      script.setAttribute(STATUS_ATTR, "loaded");
      flushIfReady(state);
    };
    script.onerror = () => {
      script.setAttribute(STATUS_ATTR, "failed");
      state.permanentlyDisabled = true;
      failAndCleanUp();
      console.error("Meta Pixel script failed to load");
    };
    document.head.appendChild(script);
    state.scriptStatus = "loading";
    state.ownsQueue = true;
  } catch (err) {
    state.permanentlyDisabled = true;
    failAndCleanUp();
    console.error("Meta Pixel script injection failed:", err);
  }
}

function adoptOwnScript(state: MetaPixelGlobalState, ownScript: Element) {
  const marker = ownScript.getAttribute(STATUS_ATTR);

  if (marker === "loaded" && getOwnLoadedFbq()) {
    state.scriptStatus = "loaded";
    state.ownsQueue = true;
    flushIfReady(state);
  } else if (marker === "loading" && getOwnCallableFbq()) {
    state.scriptStatus = "loading";
    state.ownsQueue = true;
  } else {
    state.scriptStatus = "failed";
    state.ownsQueue = false;
    state.permanentlyDisabled = true;
  }
}

function ensureScriptRequested(state: MetaPixelGlobalState) {
  if (state.scriptStatus !== "idle") return;

  const ownScript = document.getElementById(PIXEL_SCRIPT_ID);
  if (ownScript) {
    adoptOwnScript(state, ownScript);
    return;
  }

  const foreignScript = document.querySelector(`script[src="${PIXEL_SCRIPT_SRC}"]`);
  if (foreignScript) {
    enterForeignScriptConflict(state);
    return;
  }

  injectOwnScript(state);
}

/**
 * Marketing-only, consent-gated Meta Pixel. Renders nothing. Mounted
 * once inside ConsentProvider in src/app/(marketing)/layout.tsx (inside
 * its own Suspense boundary, for useSearchParams), never in any
 * non-marketing layout.
 */
export function MetaPixel() {
  const { decision, hasChecked } = useConsent();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawPixelId = clientEnv.NEXT_PUBLIC_META_PIXEL_ID;
  const validPixelId = isValidPixelId(rawPixelId) ? rawPixelId : null;
  const marketingConsent = decision?.marketing === true;

  // urlKey exists PURELY as a React effect dependency, so the tracking
  // effect re-runs on navigation. Its own encoding is irrelevant — the
  // effect body below re-derives the actual value it records via
  // getCurrentUrlKey(), never this string directly.
  const query = searchParams.toString();
  const urlKey = query ? `${pathname}?${query}` : pathname;

  // ── Mount-lifecycle effect: close consent desire on GENUINE marketing
  // ── exit only.
  //
  // React 18+ Strict Mode's dev-only double-invoke runs cleanup and the
  // remounted effect's setup SYNCHRONOUSLY, within the same commit —
  // both complete before the JS engine ever drains its microtask queue.
  // A genuine route change (via Next.js's router) is not synchronous in
  // that same way: even a fast /products -> /admin -> /products sequence
  // involves separate render/commit cycles, each of which completes (and
  // any of *their* microtasks flush) before the next one's effects run.
  // queueMicrotask is therefore the narrowest boundary that still
  // reliably distinguishes the two: by the time a Strict-Mode-remount's
  // deferred check actually runs, the synchronous remount has already
  // bumped mountCount/mountToken; by the time a genuine exit's deferred
  // check runs, no remount has happened (yet) if none occurred within
  // that same microtask window. Unlike a fixed-delay timer, this
  // introduces no artificial debounce window that could ever merge or
  // blur together two genuinely distinct, closely-timed real
  // navigations.
  useEffect(() => {
    const state = getGlobalState();
    state.mountCount += 1;
    const myToken = ++state.mountToken;

    return () => {
      state.mountCount -= 1;
      queueMicrotask(() => {
        if (state.mountToken !== myToken) return; // superseded by a newer mount
        if (state.mountCount > 0) return; // some instance is (still/again) mounted
        state.desiredConsent = false;
        closeConsentDesire(state); // also clears desiredUrlKey
      });
    };
  }, []);

  // ── Tracking effect ──────────────────────────────────────────────────
  useEffect(() => {
    const state = getGlobalState();

    if (state.permanentlyDisabled) return;

    if (
      state.initializedPixelId !== null &&
      validPixelId !== null &&
      state.initializedPixelId !== validPixelId
    ) {
      enterIdentityConflict(state);
      return;
    }

    const desiredConsent = hasChecked && marketingConsent && validPixelId !== null;
    state.desiredConsent = desiredConsent;
    state.desiredPixelId = validPixelId;

    if (!desiredConsent) {
      closeConsentDesire(state); // also clears desiredUrlKey
      return;
    }

    // Positive confirmation that a MetaPixel instance is mounted and
    // genuinely on this URL right now — read via getCurrentUrlKey(), the
    // SAME function flushIfReady() uses, so both sides of that later
    // comparison are always in the identical canonical form. (urlKey
    // above, from usePathname()/useSearchParams(), only triggers this
    // effect to re-run — its own string value is not used here.)
    state.desiredUrlKey = getCurrentUrlKey();

    ensureScriptRequested(state);

    if (state.permanentlyDisabled || state.scriptStatus === "failed") {
      return;
    }

    flushIfReady(state);
  }, [hasChecked, marketingConsent, validPixelId, urlKey]);

  return null;
}