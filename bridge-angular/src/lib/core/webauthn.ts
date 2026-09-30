/**
 * TBP-744 / TBP-515 — the browser half of a passkey ceremony.
 *
 * auth-core fetches the options and verifies the result; the WebAuthn call in
 * between (`navigator.credentials.*`, wrapped by `@simplewebauthn/browser`)
 * belongs to the UI package. Mirrors bridge-svelte and bridge-react: a regular
 * dependency, loaded on first use so apps without passkeys never fetch it, and
 * `window.__simpleWebAuthn` wins when set — the e2e suite's virtual
 * authenticator hook.
 */

type SimpleWebAuthn = {
  startAuthentication: (opts: { optionsJSON: unknown; useBrowserAutofill?: boolean }) => Promise<unknown>;
  startRegistration: (opts: { optionsJSON: unknown }) => Promise<unknown>;
};

async function simpleWebAuthn(): Promise<SimpleWebAuthn> {
  const injected =
    typeof window !== 'undefined'
      ? (window as unknown as { __simpleWebAuthn?: Partial<SimpleWebAuthn> }).__simpleWebAuthn
      : undefined;
  if (injected?.startAuthentication && injected.startRegistration) return injected as SimpleWebAuthn;
  return (await import('@simplewebauthn/browser')) as unknown as SimpleWebAuthn;
}

/** True when this browser can run a passkey ceremony at all. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential
  );
}

/** Ask the authenticator to sign in with the server's options. */
export async function startPasskeyAuthentication(options: unknown, autofill = false): Promise<unknown> {
  return (await simpleWebAuthn()).startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill });
}

/** Ask the authenticator to create a passkey with the server's options. */
export async function startPasskeyRegistration(options: unknown): Promise<unknown> {
  return (await simpleWebAuthn()).startRegistration({ optionsJSON: options });
}
