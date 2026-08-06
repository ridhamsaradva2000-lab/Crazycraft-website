/**
 * Typed, versioned consent model — pure, framework-agnostic (no React,
 * no next/headers, no document.cookie access here).
 *
 * Default state is always DENIED/UNSET: any missing, malformed,
 * version-mismatched, or invalid value is treated as "no decision yet."
 * Bumping CONSENT_VERSION forces every existing visitor to be
 * re-prompted.
 *
 * The single non-essential category is `marketing` — this model exists
 * specifically to gate ad-measurement (Meta Pixel, mounted in
 * MetaPixel.tsx and gated on this choice plus a configured Pixel ID),
 * not generic anonymous analytics. A server-side Conversions API relay
 * remains unimplemented as of this comment; this model does not
 * describe or depend on one existing.
 */

export const CONSENT_VERSION = 1;
export const CONSENT_COOKIE_NAME = "crazycraft_consent";
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 365 days

export interface ConsentDecision {
  version: number;
  /** Marketing/ad-measurement cookies — e.g. Meta Pixel/CAPI, once built. */
  marketing: boolean;
  /** Canonical UTC ISO string, exactly as produced by Date#toISOString(). */
  decidedAt: string;
}

// Matches exactly the shape Date#toISOString() produces:
// "2026-08-04T12:34:56.789Z" — millisecond precision, literal "Z", no
// timezone offset variant. Anything else is rejected outright, before
// even attempting to parse it.
const CANONICAL_ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Small, deliberate tolerance for ordinary clock skew between the
// client that set the cookie and whatever clock is doing this
// validation later — not a loophole, just realistic slack.
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

function isValidDecidedAt(value: string): boolean {
  if (!CANONICAL_ISO_UTC_REGEX.test(value)) return false;
  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) return false;
  // Round-trip check: confirms the value isn't just regex-shaped but
  // genuinely canonical (rejects e.g. an impossible calendar date that
  // the regex alone wouldn't catch, since Date normalizes those instead
  // of failing to parse them).
  if (new Date(parsedMs).toISOString() !== value) return false;
  if (parsedMs > Date.now() + FUTURE_TIMESTAMP_TOLERANCE_MS) return false;
  return true;
}

/**
 * Parses a raw cookie value into a ConsentDecision, or null if it's
 * missing, malformed, from a different consent-model version, or has a
 * non-canonical/invalid decidedAt. Never throws.
 */
export function parseConsentCookie(raw: string | undefined | null): ConsentDecision | null {
  if (!raw) return null;
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(raw));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("version" in decoded) ||
      !("marketing" in decoded) ||
      !("decidedAt" in decoded)
    ) {
      return null;
    }
    const d = decoded as { version: unknown; marketing: unknown; decidedAt: unknown };
    if (
      d.version !== CONSENT_VERSION ||
      typeof d.marketing !== "boolean" ||
      typeof d.decidedAt !== "string" ||
      !isValidDecidedAt(d.decidedAt)
    ) {
      return null;
    }
    return { version: CONSENT_VERSION, marketing: d.marketing, decidedAt: d.decidedAt };
  } catch {
    return null;
  }
}

export function serializeConsentCookie(decision: ConsentDecision): string {
  return encodeURIComponent(JSON.stringify(decision));
}

export function makeConsentDecision(marketing: boolean): ConsentDecision {
  return { version: CONSENT_VERSION, marketing, decidedAt: new Date().toISOString() };
}