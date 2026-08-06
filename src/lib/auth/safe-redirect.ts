/**
 * Validates and normalizes a caller-supplied redirect target down to a
 * safe, internal, same-origin pathname. Used everywhere a redirect
 * destination comes from a query parameter (?next=) or similar
 * user-influenceable input, so there is exactly one place this logic
 * lives and every call site behaves identically.
 *
 * Rejects, in order:
 *   - anything that isn't a non-empty string
 *   - backslashes anywhere in the input — some browsers/proxies
 *     normalize "\" to "/", so "/\evil.com" or "/\/evil.com" can become
 *     protocol-relative ("//evil.com") by the time a client actually
 *     navigates, even though the raw string doesn't literally start
 *     with "//"
 *   - anything not starting with exactly one "/" (rejects bare external
 *     URLs like "https://evil.com" and rejects "//evil.com",
 *     protocol-relative)
 *   - "@" anywhere in the input — blocks userinfo/host-confusion tricks
 *     such as "/redirect@evil.com" that some downstream parsers or
 *     proxies could misinterpret as a host boundary
 *   - as a final authoritative check: resolves the candidate against a
 *     fixed sentinel origin and confirms the origin did not change —
 *     catches anything the string checks above didn't anticipate (odd
 *     encodings, whitespace tricks, etc.)
 *
 * Query string and hash on the incoming value are discarded entirely
 * (only the pathname is ever trusted onward) — nothing in this app needs
 * to round-trip a query string through a redirect target, and dropping
 * it shrinks the attack surface further.
 */
const DEFAULT_SAFE_PATH = "/dashboard";
const SENTINEL_ORIGIN = "https://internal.invalid";

export function getSafeRedirectPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_SAFE_PATH
): string {
  if (!next || typeof next !== "string") {
    return fallback;
  }

  if (next.includes("\\")) {
    return fallback;
  }

  if (!next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  if (next.includes("@")) {
    return fallback;
  }

  try {
    const resolved = new URL(next, SENTINEL_ORIGIN);
    if (resolved.origin !== SENTINEL_ORIGIN) {
      return fallback;
    }
    return resolved.pathname.startsWith("/") ? resolved.pathname : fallback;
  } catch {
    return fallback;
  }
}
