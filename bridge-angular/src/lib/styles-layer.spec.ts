/**
 * TBP-944 (svelte TBP-814) — the default stylesheet follows the app's type and
 * loses to the app's CSS. Same contract as bridge-svelte's `styles.test.ts`:
 *   - the layer order statement comes first, `bridge` last after Tailwind v4's layers;
 *   - `--bridge-text-base` is registered with `@property`, outside any layer;
 *   - every rule after that sits inside one `@layer bridge` block;
 *   - no text size is a fixed `rem` any more, and no weight is hard-coded except
 *     the two avatar initials;
 *   - the token fallbacks are the values the rules had before, so an app that
 *     sets nothing sees no change.
 * And the components' own `styles` (bridge-angular keeps almost everything in
 * styles.css) sit in the same layer, except the realtime developer badge.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Decl = { type: 'decl'; property: string; value: string };
type Rule = { type: 'rule'; selector: string; children: Node[] };
type AtRule = { type: 'atrule'; name: string; prelude: string; children: Node[] | null };
type Node = Decl | Rule | AtRule;

/** A small CSS parser: enough for rules, nested at-rules and declarations. */
function parseCss(source: string): Node[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  function block(): Node[] {
    const nodes: Node[] = [];
    let buf = '';
    while (i < css.length) {
      const ch = css[i++];
      if (ch === '{') {
        const head = buf.trim();
        buf = '';
        const children = block();
        if (head.startsWith('@')) {
          const [, name, prelude] = head.match(/^@([\w-]+)\s*([\s\S]*)$/)!;
          nodes.push({ type: 'atrule', name, prelude: prelude.trim(), children });
        } else {
          nodes.push({ type: 'rule', selector: head.replace(/\s+/g, ' '), children });
        }
      } else if (ch === '}') {
        if (buf.trim()) nodes.push(decl(buf));
        return nodes;
      } else if (ch === ';') {
        const text = buf.trim();
        buf = '';
        if (!text) continue;
        if (text.startsWith('@')) {
          const [, name, prelude] = text.match(/^@([\w-]+)\s*([\s\S]*)$/)!;
          nodes.push({ type: 'atrule', name, prelude: prelude.trim(), children: null });
        } else nodes.push(decl(text));
      } else buf += ch;
    }
    return nodes;
  }
  function decl(text: string): Decl {
    const at = text.indexOf(':');
    return { type: 'decl', property: text.slice(0, at).trim(), value: text.slice(at + 1).trim().replace(/\s+/g, ' ') };
  }
  return block();
}

type Found = { selector: string; property: string; value: string };

function declarations(nodes: Node[], out: Found[] = []): Found[] {
  for (const node of nodes) {
    if (node.type === 'rule') {
      for (const c of node.children) if (c.type === 'decl') out.push({ selector: node.selector, property: c.property, value: c.value });
      declarations(node.children.filter((c) => c.type !== 'decl'), out);
    } else if (node.type === 'atrule' && node.children) {
      declarations(node.children, out);
    }
  }
  return out;
}

const source = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');
const sheet = parseCss(source);
const all = declarations(sheet);
const valueOf = (selector: string, property: string) =>
  all.find((d) => d.selector.split(',').map((s) => s.trim()).includes(selector) && d.property === property)?.value;

describe('styles.css — cascade layer (TBP-944)', () => {
  it('opens with the layer order statement, bridge after Tailwind v4’s layers', () => {
    const first = sheet[0];
    expect(first.type === 'atrule' && first.name).toBe('layer');
    if (first.type !== 'atrule') return;
    expect(first.children).toBeNull();
    expect(first.prelude.split(',').map((s) => s.trim())).toEqual(['theme', 'base', 'components', 'utilities', 'bridge']);
  });

  it('registers --bridge-text-base with @property, outside the layer', () => {
    const second = sheet[1];
    expect(second.type === 'atrule' && second.name).toBe('property');
    if (second.type !== 'atrule' || !second.children) return;
    expect(second.prelude).toBe('--bridge-text-base');
    const descriptors = Object.fromEntries(
      second.children.map((c) => (c.type === 'decl' ? [c.property, c.value] : ['', ''])),
    );
    expect(descriptors).toMatchObject({ syntax: "'<length>'", inherits: 'true', 'initial-value': '16px' });
  });

  it('puts everything after the @property inside a single @layer bridge block', () => {
    expect(sheet).toHaveLength(3);
    const layer = sheet[2];
    expect(layer.type === 'atrule' && layer.name).toBe('layer');
    if (layer.type !== 'atrule') return;
    expect(layer.prelude).toBe('bridge');
    expect(layer.children?.length).toBeGreaterThan(100);
    expect(sheet.filter((n) => n.type === 'rule')).toHaveLength(0);
  });

  it('derives the base text size from the app’s <body>', () => {
    expect(valueOf(':where(body)', '--bridge-text-base')).toBe('var(--bridge-font-size, 1em)');
  });
});

describe('styles.css — type follows the app (TBP-944)', () => {
  it('has no fixed rem font sizes left', () => {
    const fixed = all.filter((d) => d.property === 'font-size' && /^[\d.]+rem$/.test(d.value));
    expect(fixed).toEqual([]);
  });

  it('scales every relative font size from --bridge-text-base with a 1rem fallback', () => {
    const sizes = all.filter((d) => d.property === 'font-size' && d.value !== 'inherit');
    expect(sizes.length).toBeGreaterThan(50);
    for (const d of sizes) {
      expect(d.value, d.selector).toMatch(/^calc\([\d.]+ \* var\(--bridge-text-base, 1rem\)\)$/);
    }
  });

  it('hard-codes no font-weight except the two avatar initials', () => {
    // `inherit` (the sign-in page's text links, TBP-899) defers to the app, so it counts as following it.
    const literal = all.filter((d) => d.property === 'font-weight' && !d.value.startsWith('var(') && d.value !== 'inherit');
    expect(literal.map((d) => d.selector).sort()).toEqual(['.bridge-tenant-avatar', '[data-bridge-workspace-avatar]']);
    for (const d of all.filter((d) => d.property === 'font-weight' && d.value.startsWith('var('))) {
      expect(d.value, d.selector).toMatch(/^var\(--bridge-font-weight-(heading|button|label), \d{3}\)$/);
    }
  });

  it('keeps the previous values as the token fallbacks', () => {
    // Before: `.bridge-btn { font-size: 0.875rem; font-weight: 500 }`.
    expect(valueOf('.bridge-btn', 'font-size')).toBe('calc(0.875 * var(--bridge-text-base, 1rem))');
    expect(valueOf('.bridge-btn', 'font-weight')).toBe('var(--bridge-font-weight-button, 500)');
    // `.bridge-plan-price-amount { font-size: 1.9rem; font-weight: 700 }` (svelte TBP-813).
    expect(valueOf('.bridge-plan-price-amount', 'font-size')).toBe('calc(1.9 * var(--bridge-text-base, 1rem))');
    expect(valueOf('.bridge-plan-price-amount', 'font-weight')).toBe('var(--bridge-font-weight-heading, 700)');
    // The Angular-only page styles too: `.bridge-billing-heading { 1.5rem; 700 }`.
    expect(valueOf('.bridge-billing-heading', 'font-size')).toBe('calc(1.5 * var(--bridge-text-base, 1rem))');
    expect(valueOf('.bridge-billing-heading', 'font-weight')).toBe('var(--bridge-font-weight-heading, 700)');
    expect(valueOf('.bridge-billing-label', 'font-weight')).toBe('var(--bridge-font-weight-label, 600)');
  });

  it('gives every button a shadow token that defaults to none', () => {
    for (const selector of ['.bridge-btn', '.bridge-btn-primary', '.bridge-btn-secondary', '.bridge-btn-danger']) {
      expect(valueOf(selector, 'box-shadow'), selector).toBe('var(--bridge-button-shadow, none)');
    }
  });

  it('lets --bridge-card-shadow style the plan-change dialog, defaulting to its old shadow', () => {
    const dialog = all.filter(
      (d) => d.property === 'box-shadow' && d.value === 'var(--bridge-card-shadow, 0 24px 60px -12px rgba(0, 0, 0, 0.35))',
    );
    expect(dialog.map((d) => d.selector)).toEqual(['.bridge-plan-confirm']);
  });
});

describe('styles.css — the subscription page surfaces (TBP-944, svelte TBP-813)', () => {
  it('plan cards and the current-plan panel are surfaces driven by the card tokens', () => {
    expect(valueOf('[data-bridge-plan-card]', 'background')).toBe('var(--bridge-card-bg, var(--bridge-bg))');
    expect(valueOf('.bridge-billing-summary', 'box-shadow')).toBe(
      'var(--bridge-card-shadow, 0 1px 2px rgb(16 24 40 / 0.06), 0 1px 3px rgb(16 24 40 / 0.04))',
    );
  });

  it('marks the current plan with the brand colour, and styles the checkout banner from the success tokens', () => {
    expect(valueOf('[data-bridge-plan-card][data-current="true"]', 'border')).toBe('2px solid var(--bridge-primary)');
    expect(valueOf('.bridge-plan-current-flag', 'background')).toBe('var(--bridge-primary)');
    expect(valueOf('.bridge-checkout-notice', 'background')).toBe('var(--bridge-alert-success-bg)');
  });
});

describe('component styles sit in the bridge layer (TBP-944)', () => {
  const root = resolve(__dirname, 'components');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.component.ts') ? [p] : [];
    });

  /** The CSS of each component that has inline `styles`. */
  const styled = files(root)
    .map((path) => {
      const ts = readFileSync(path, 'utf8');
      const m = ts.match(/styles:\s*\[\s*`([\s\S]*?)`\s*,?\s*\]/);
      return m ? { path: path.slice(root.length + 1), css: m[1].replace(/\\`/g, '`') } : null;
    })
    .filter((x): x is { path: string; css: string } => x !== null);

  it('finds the components that carry their own styles', () => {
    expect(styled.map((s) => s.path).sort()).toEqual([
      'developer/realtime-dev-badge.component.ts',
      'login/login.component.ts',
    ]);
  });

  it('wraps every rule in one @layer bridge block, sized from the text base', () => {
    for (const { path, css } of styled.filter((s) => !s.path.startsWith('developer/'))) {
      const nodes = parseCss(css);
      expect(nodes, path).toHaveLength(1);
      const layer = nodes[0];
      expect(layer.type === 'atrule' && `${layer.name} ${layer.prelude}`, path).toBe('layer bridge');
      for (const d of declarations(nodes).filter((d) => d.property === 'font-size')) {
        expect(d.value, path).toMatch(/^calc\([\d.]+ \* var\(--bridge-text-base, 1rem\)\)$/);
      }
    }
  });

  it('leaves the realtime developer badge unlayered: it is a developer overlay, not app UI', () => {
    const badge = styled.find((s) => s.path.startsWith('developer/'))!;
    expect(parseCss(badge.css).some((n) => n.type === 'atrule' && n.name === 'layer')).toBe(false);
  });
});
