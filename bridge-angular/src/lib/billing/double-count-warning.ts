/**
 * TBP-515 (svelte TBP-697) — in development, warn when the browser and the
 * backend both count the same metric.
 *
 * The rule: count once, where the action happens. When the click calls your
 * server, the backend handler counts (bridge-nestjs `@RequireQuota` /
 * `@SyncQuota`) and the page only shows the number. When no backend sees the
 * action, the browser counts (`BridgeService.usage.report` / `set`). Doing both
 * counts every action twice, and nothing else would ever say so.
 *
 * Outside production, bridge-nestjs marks a counting endpoint's response with
 * `X-Bridge-Usage-Counted: <metric>[, <metric>]`. `bridgeInterceptor` and
 * `bridgeFetch` record those metrics; `BridgeService.usage` records what the
 * page reports; a metric seen on both sides is warned about once. Development
 * builds only (`isDevMode()`): in production nothing is recorded or printed.
 */
import { isDevMode } from '@angular/core';

/** The response header bridge-nestjs sets, outside production, on a counting endpoint. */
export const USAGE_COUNTED_HEADER = 'x-bridge-usage-counted';

const countedByBackend = new Set<string>();
const countedByBrowser = new Set<string>();
const warned = new Set<string>();

function dev(): boolean {
  try {
    return isDevMode();
  } catch {
    return false;
  }
}

function warnIfBoth(metric: string): void {
  if (warned.has(metric) || !countedByBackend.has(metric) || !countedByBrowser.has(metric)) return;
  warned.add(metric);
  console.warn(
    `[bridge] '${metric}' is counted twice: your backend counts it (bridge-nestjs @RequireQuota / @SyncQuota) ` +
      `and this page also reports it with bridge.usage. Count once, where the action happens: ` +
      `when the click calls your server, keep the backend count and remove the bridge.usage call. ` +
      `(Development only — this warning is not shown in production.)`,
  );
}

/** `usage.report` / `set` was called for `metric` from this page. */
export function noteBrowserCount(metric: string): void {
  if (!dev() || typeof metric !== 'string' || metric === '') return;
  countedByBrowser.add(metric);
  warnIfBoth(metric);
}

/** A response header value from the app's own backend — the metrics it says it counted. */
export function noteBackendCounted(value: string | null | undefined): void {
  if (!dev() || !value) return;
  for (const raw of value.split(',')) {
    const metric = raw.trim();
    if (!metric) continue;
    countedByBackend.add(metric);
    warnIfBoth(metric);
  }
}

/** Test hook: forget everything seen so far. */
export function __resetDoubleCountWarning(): void {
  countedByBackend.clear();
  countedByBrowser.clear();
  warned.clear();
}
