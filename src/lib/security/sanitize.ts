/**
 * Input sanitisation (§7).
 * Untrusted text is data: normalise it, strip control/format characters (zero-width,
 * soft hyphen, bidi overrides) and enforce a byte ceiling.
 */

/** Strip control and invisible format characters from user text. */
export function sanitize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\p{Cf}/gu, "")
    .trim();
}

/** Validate that the request body is within size limits. */
export function validateBodySize(body: string, maxBytes = 8192): boolean {
  return new TextEncoder().encode(body).length <= maxBytes;
}
