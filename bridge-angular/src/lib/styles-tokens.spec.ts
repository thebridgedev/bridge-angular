/**
 * TBP-744 — the `--bridge-*` token contract matches the other plugins: every
 * token bridge-svelte documents is declared (or derived) here, the defaults sit
 * on the zero-specificity `:where(:root)` so an app's own `:root` always wins,
 * and component styles read tokens rather than fixed colours.
 *
 * Revert-proof: origin/main declared its defaults on plain `:root` (the app's
 * value lost whenever the plugin's stylesheet loaded later) and had no
 * `--bridge-bg`, `--bridge-overlay`, info/warning alert or page-layout tokens.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');

// The contract as bridge-svelte's learning/mechanisms.md lists it.
const CONTRACT = [
  '--bridge-primary',
  '--bridge-primary-hover',
  '--bridge-primary-fg',
  '--bridge-primary-light',
  '--bridge-input-focus',
  '--bridge-bg',
  '--bridge-foreground',
  '--bridge-muted',
  '--bridge-muted-bg',
  '--bridge-border',
  '--bridge-border-radius',
  '--bridge-overlay',
  '--bridge-alert-error-bg',
  '--bridge-alert-error-fg',
  '--bridge-alert-error-border',
  '--bridge-alert-success-bg',
  '--bridge-alert-success-fg',
  '--bridge-alert-success-border',
  '--bridge-alert-info-bg',
  '--bridge-alert-info-fg',
  '--bridge-alert-info-border',
  '--bridge-alert-warning-bg',
  '--bridge-alert-warning-fg',
  '--bridge-alert-warning-border',
  '--bridge-auth-page-padding',
  '--bridge-billing-page-width',
  '--bridge-billing-page-padding',
  '--bridge-paywall-bg',
  '--bridge-paywall-panel-bg',
];

describe('the --bridge-* token contract (TBP-744)', () => {
  it('uses every documented token', () => {
    const missing = CONTRACT.filter((token) => !css.includes(`var(${token}`) && !css.includes(`${token}:`));
    expect(missing).toEqual([]);
  });

  it('declares its defaults with zero specificity', () => {
    expect(css).toMatch(/:where\(:root\)\s*\{[^}]*--bridge-primary:\s*#4f46e5/);
    expect(css).not.toMatch(/^:root\s*\{/m);
  });

  it('styles the billing surfaces from tokens, not fixed colours', () => {
    const banner = css.slice(css.indexOf('.bqb-severity-warn'), css.indexOf('.bqb-severity-warn') + 200);
    expect(banner).toContain('var(--bridge-alert-warning-bg');
  });
});
