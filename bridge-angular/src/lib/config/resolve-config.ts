/**
 * TBP-744 — the effective Bridge config, by the same rules as every other
 * plugin: an explicit option wins over the default, an empty value counts as
 * unset, and the hosted sign-in pages follow the API address on Bridge's own
 * domains. Angular port of bridge-svelte's `client/resolve-config.ts` (TBP-695).
 *
 * Angular has no environment-variable convention (the CLI has no
 * `import.meta.env`), so there is no environment layer: the app passes values
 * from its own `environment.ts`. The precedence is therefore
 * *explicit option > default*, which is the other plugins' chain with the
 * environment step empty.
 */
import type { BridgeConfig } from '../types/config';

/** Where Bridge's production API lives — the default when no address is set. */
export const PRODUCTION_API_BASE_URL = 'https://api.thebridge.dev';

/** Where Bridge's production hosted pages live. */
export const PRODUCTION_HOSTED_URL = 'https://auth.thebridge.dev';

/**
 * The hosted pages for an API address on Bridge's own domains: `api` becomes
 * `auth`, so `api-stage.thebridge.dev` pairs with `auth-stage.thebridge.dev`.
 * Any other host (localhost, self-hosted) cannot be derived.
 */
export function hostedUrlFor(apiBaseUrl: string): string | undefined {
  try {
    const url = new URL(apiBaseUrl);
    const match = /^api(-[a-z0-9-]+)?\.thebridge\.dev$/.exec(url.hostname);
    return match ? `https://auth${match[1] ?? ''}.thebridge.dev` : undefined;
  } catch {
    return undefined;
  }
}

// An empty value means "not set": `apiBaseUrl: environment.apiBaseUrl ?? ''`
// and friends must never count as a value.
function present(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Warnings about the resolved config, for development builds. */
export function configWarnings(options: Partial<BridgeConfig>, resolved: BridgeConfig): string[] {
  const warnings: string[] = [];
  if (!present(options.apiBaseUrl)) {
    warnings.push(
      `[bridge] apiBaseUrl is not set, so app ${resolved.appId} is using production ` +
        `(${PRODUCTION_API_BASE_URL}). Pass apiBaseUrl to provideBridge() if this is a stage or local app.`,
    );
  } else if (!resolved.hostedUrl) {
    warnings.push(
      `[bridge] hostedUrl is not set and cannot be derived from ${resolved.apiBaseUrl}, ` +
        `so hosted sign-in pages will open on production. Pass hostedUrl to provideBridge().`,
    );
  }
  return warnings;
}

/**
 * Build the effective config from what the app passed.
 *
 * Refuses to guess: with no app id it throws, naming the option to set. An app
 * id with no API address runs against production — the documented shape of a
 * production app.
 */
export function resolveBridgeConfig(options: Partial<BridgeConfig> | string = {}): BridgeConfig {
  const input: Partial<BridgeConfig> = typeof options === 'string' ? { appId: options } : (options ?? {});
  const appId = present(input.appId);
  if (!appId) {
    throw new Error(
      '[bridge] No Bridge app id was found. Pass { appId } to provideBridge() ' +
        '(plus apiBaseUrl for a stage or local app).',
    );
  }

  const apiBaseUrl = present(input.apiBaseUrl);
  const hostedUrl = present(input.hostedUrl) ?? (apiBaseUrl ? hostedUrlFor(apiBaseUrl) : undefined);

  const resolved: BridgeConfig = { ...input, appId };
  if (apiBaseUrl) resolved.apiBaseUrl = apiBaseUrl;
  else delete resolved.apiBaseUrl;
  if (hostedUrl) resolved.hostedUrl = hostedUrl;
  else delete resolved.hostedUrl;
  for (const key of ['callbackUrl', 'loginRoute', 'defaultRedirectRoute'] as const) {
    const value = present(resolved[key]);
    if (value) resolved[key] = value;
    else delete resolved[key];
  }
  return resolved;
}
