/**
 * Crypto-random ID for the webview (Web Crypto API; same idea as getNonce on the extension host).
 * Uses base64url so IDs are URL- and filename-safe.
 *
 * @param size - Number of random bytes (default 32). Longer = more entropy.
 * @returns Base64url-encoded string (no padding).
 */
export function randomId(size = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return toBase64Url(bytes);
}

/**
 * Encode bytes as base64url (no padding, safe for URLs and filenames).
 * @param bytes - Raw bytes to encode.
 * @returns Base64url string without padding.
 */
function toBase64Url(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}
