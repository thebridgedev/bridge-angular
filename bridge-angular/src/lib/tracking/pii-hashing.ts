/**
 * Client-side PII hashing for ad-platform advanced matching.
 *
 * Framework-agnostic — ported near-verbatim from bridge-svelte's
 * `client/tracking/pii-hashing.ts`.
 *
 * Normalization MUST match the server-side util at
 * `bridge-api/microservices/account/nebulr-api/utils/pii-hashing.util.ts`:
 *   trim → lowercase → SHA-256 → hex.
 *
 * Any divergence between client and server hashing silently hurts match rates.
 */

export async function sha256Email(
  email: string | null | undefined,
): Promise<string | undefined> {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256Hex(normalized);
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    // SSR / non-browser context without WebCrypto — skip hashing.
    // Callers treat undefined as "advanced matching unavailable" and fall back to plain pixel.
    return undefined as unknown as string;
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
