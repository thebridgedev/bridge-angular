/**
 * TBP-744 — "your backend refused this because a plan limit is reached", and
 * "this feature is not on your plan", as state the upgrade dialog reads.
 * Angular port of bridge-svelte's `core/quota-refusal.ts` + `core/feature-upgrade.ts`.
 *
 * A backend guarded by `@RequireQuota` (bridge-nestjs) answers a request made at
 * the plan's cap with:
 *
 *   402 { statusCode: 402, code: 'QUOTA_EXCEEDED', message, metric, used, limit, fix }
 *
 * and a flag-gated endpoint whose plan lacks the feature with
 *
 *   402 { code: 'FEATURE_NOT_IN_PLAN', flag, feature, fix }
 *
 * `bridgeInterceptor` (HttpClient) and `bridgeFetch()` hand every such answer to
 * {@link observeRefusalBody}. The upgrade dialog `provideBridge()` mounts shows
 * it; `onBridgeQuotaExceeded()` hands it to anything else that wants it.
 *
 * Owner rule (2026-09-28): nothing opens by itself. The feature variant opens
 * only when the person did something gated — a plan-gated route, a click on a
 * `<bridge-feature-flag upgrade>` prompt, or a refused request.
 *
 * The dialog is decoration. The refusal is the backend's; this only explains it.
 */
import { signal, type Signal } from '@angular/core';

/** A backend's "plan limit reached" answer, as the upgrade dialog shows it. */
export interface BridgeQuotaRefusal {
  /** The quota metric the plan ran out of, e.g. `'tickets'`. */
  metric: string;
  /** How much was used when the request was refused, if the backend said. */
  used: number | null;
  /** The plan's cap, if the backend said. */
  limit: number | null;
  /** Where to upgrade, from the refusal's `fix` — a same-app path only, else null. */
  fix: string | null;
  /** The backend's own message, if it sent one. */
  message: string | null;
  /** The URL of the request that was refused. */
  url: string;
}

/** Why a feature is off, as Bridge reports it. */
export type BridgeFeatureOffReason = 'plan' | 'permission' | 'off' | 'rule' | 'rollout';

/** A request to show the upgrade dialog for a feature the plan does not include. */
export interface BridgeFeatureUpgrade {
  /** The feature flag that is off. */
  flag: string | null;
  /** The plan feature the flag's rule asks for, when it names one. */
  feature: string | null;
  /** Where to upgrade, from a backend refusal's `fix` (a same-app path), else null. */
  fix: string | null;
}

/**
 * A same-app path, or null. A backend's `fix` becomes a link the user clicks,
 * so an absolute URL, a protocol-relative `//host` or a `javascript:` value is
 * never followed — the configured subscription page is used instead.
 */
export function safeFixPath(fix: unknown): string | null {
  if (typeof fix !== 'string') return null;
  const value = fix.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The refusal in a 402 body, or null when the body is not a quota refusal. */
export function parseQuotaRefusal(body: unknown, url = ''): BridgeQuotaRefusal | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b['code'] !== 'QUOTA_EXCEEDED') return null;
  const metric = b['metric'];
  if (typeof metric !== 'string' || metric.trim() === '') return null;
  const message = b['message'];
  return {
    metric,
    used: numberOrNull(b['used']),
    limit: numberOrNull(b['limit']),
    fix: safeFixPath(b['fix']),
    message: typeof message === 'string' && message.trim() !== '' ? message : null,
    url,
  };
}

/** The upgrade request in a `402 FEATURE_NOT_IN_PLAN` body, or null. */
export function parseFeatureRefusal(body: unknown): BridgeFeatureUpgrade | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b['code'] !== 'FEATURE_NOT_IN_PLAN') return null;
  const flag = b['flag'];
  const feature = b['feature'];
  return {
    flag: typeof flag === 'string' && flag ? flag : null,
    feature: typeof feature === 'string' && feature ? feature : null,
    fix: safeFixPath(b['fix']),
  };
}

// ── State ────────────────────────────────────────────────────────────────────

type Listener = (refusal: BridgeQuotaRefusal) => void;

const _listeners = new Set<Listener>();
const _quotaRefusal = signal<BridgeQuotaRefusal | null>(null);
const _featureUpgrade = signal<BridgeFeatureUpgrade | null>(null);

/** The plan-limit refusal the upgrade dialog is showing, or `null`. */
export const quotaRefusal: Signal<BridgeQuotaRefusal | null> = _quotaRefusal.asReadonly();

/** The feature upgrade the dialog is showing, or `null`. */
export const featureUpgrade: Signal<BridgeFeatureUpgrade | null> = _featureUpgrade.asReadonly();

/** Close the upgrade dialog's plan-limit variant. */
export function dismissQuotaRefusal(): void {
  _quotaRefusal.set(null);
}

/** Close the upgrade dialog's feature variant. */
export function dismissFeatureUpgrade(): void {
  _featureUpgrade.set(null);
}

/**
 * Run `handler` every time a backend refuses a request because a plan limit is
 * reached — for an app that turned the dialog off (`billing.upgradeDialog:
 * false`) and shows something else, or that logs it. Returns an unsubscribe.
 */
export function onBridgeQuotaExceeded(handler: Listener): () => void {
  _listeners.add(handler);
  return () => {
    _listeners.delete(handler);
  };
}

/** Announce a refusal: the dialog shows it and every listener hears it. */
export function reportQuotaRefusal(refusal: BridgeQuotaRefusal): void {
  _quotaRefusal.set(refusal);
  for (const listener of [..._listeners]) {
    try {
      listener(refusal);
    } catch {
      /* one broken listener must not stop the dialog or the others */
    }
  }
}

/**
 * Open the upgrade dialog for a feature the plan does not include. Call it from
 * a click or a refused action; a page render must never call it.
 */
export function openFeatureUpgrade(
  request: { flag?: string | null; feature?: string | null; fix?: string | null } = {},
): void {
  _featureUpgrade.set({
    flag: request.flag ?? null,
    feature: request.feature ?? null,
    fix: safeFixPath(request.fix),
  });
}

/**
 * Hand a 402 body to the refusal check: a quota refusal opens the plan-limit
 * dialog, a feature refusal its feature variant. Anything else is ignored.
 * Returns what it recognised, for tests.
 */
export function observeRefusalBody(body: unknown, url = ''): 'quota' | 'feature' | null {
  const refusal = parseQuotaRefusal(body, url);
  if (refusal) {
    reportQuotaRefusal(refusal);
    return 'quota';
  }
  const feature = parseFeatureRefusal(body);
  if (feature) {
    openFeatureUpgrade(feature);
    return 'feature';
  }
  return null;
}

// ── Which URLs are watched ───────────────────────────────────────────────────

function originOf(url: string, base?: string): string | null {
  try {
    return new URL(url, base).origin;
  } catch {
    return null;
  }
}

/**
 * Whether `url` is the app's own backend or Bridge's API: the page's own origin
 * (a same-origin `/api` proxy), Bridge's API, or an origin the app listed in
 * `billing.apiOrigins`. The interceptor only sends the user's token to, and
 * only reads 402s from, these — a 402 from a payment provider or a third-party
 * API is not the app's plan limit, and the token never leaves for one.
 */
export function watchesOrigin(
  url: string,
  options: { pageOrigin?: string; apiBaseUrl?: string; apiOrigins?: readonly string[] } = {},
): boolean {
  const target = originOf(url, options.pageOrigin);
  if (!target) return false;
  if (options.pageOrigin && target === originOf(options.pageOrigin)) return true;
  if (options.apiBaseUrl && target === originOf(options.apiBaseUrl)) return true;
  return (options.apiOrigins ?? []).some((o) => originOf(o) === target);
}

/** Test-only: forget listeners and anything showing. */
export function __resetRefusalsForTests(): void {
  _listeners.clear();
  dismissQuotaRefusal();
  dismissFeatureUpgrade();
}
