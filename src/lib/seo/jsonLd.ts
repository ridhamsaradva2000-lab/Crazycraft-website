/**
 * Safely serializes a value for embedding inside a
 * `<script type="application/ld+json">` tag via `dangerouslySetInnerHTML`.
 *
 * The values passed through this (product names/descriptions, category
 * names, etc.) are database-managed content, not compile-time-static
 * strings — a plain `JSON.stringify(value)` is not safe to drop directly
 * into `dangerouslySetInnerHTML` on its own, since a stored value
 * containing something like `</script>` would prematurely close the
 * surrounding script tag and let the remainder be parsed as HTML/JS.
 *
 * This escapes:
 * - `<` as `\u003c` — the character that would let a stored value break
 *   out of the `<script>` tag (e.g. via a literal `</script>` substring)
 * - U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) — valid,
 *   unescaped JSON string characters that historically cause issues if
 *   the content is ever handled as JS source rather than inert JSON text
 *
 * JSON.stringify already escapes `"` and control characters on its own,
 * so those are not duplicated here.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
