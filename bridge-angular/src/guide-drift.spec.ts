// Guide drift — the guides this repo serves to people and to AI agents (mcp/,
// learning/, README.md; the Bridge MCP server reads them from GitHub main) may
// only name what the package really has. A guide that imports a removed export,
// renders a component under an old selector, or binds an input the component
// never had produces code that does not compile, and an agent following it has
// no way to know.
//
// What is checked, read from the package source with the TypeScript compiler
// (nothing is listed by hand, so a rename in the code turns this red):
//   - every name imported from '@nebulr-group/bridge-angular' is exported by
//     src/public-api.ts, and no other subpath than './styles.css' is imported;
//   - every `<bridge-…>` element is a component selector, and every attribute
//     bound on it is one of that component's inputs or outputs;
//   - every `*bridgeX` / `[bridgeX]` is a directive selector or a directive input;
//   - an SDK-looking name in inline code (`FooComponent`, `injectQuota()`,
//     `createQuotaSignal()`, `bridgeAuthGuard()`, …) is exported;
//   - `bridge.<member>` (the injected BridgeService) names a real member;
//   - `billing.<option>` and the keys of a `BridgeConfig = { … }` literal are
//     real `BridgeConfig` options.
//
// Lives in src/ (not src/lib) and is a .spec.ts, so the library build never
// includes it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(PKG, '..');
const SRC = join(PKG, 'src');
const PACKAGE = '@nebulr-group/bridge-angular';

// ── What the package has ────────────────────────────────────────────────────

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

interface Surface {
  exports: Set<string>;
  /** Element selector → its inputs and outputs. */
  elements: Map<string, Set<string>>;
  /** Attribute-directive names (`bridgeEntitled`) and their inputs. */
  directiveNames: Set<string>;
  bridgeServiceMembers: Set<string>;
  configKeys: Set<string>;
  billingKeys: Set<string>;
}

function readSurface(): Surface {
  const files = tsFiles(join(SRC, 'lib')).concat(join(SRC, 'public-api.ts'));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    experimentalDecorators: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();

  const apiFile = program.getSourceFile(join(SRC, 'public-api.ts'))!;
  const apiSymbol = checker.getSymbolAtLocation(apiFile)!;
  const exports = new Set(checker.getExportsOfModule(apiSymbol).map((s) => s.getName()));

  const elements = new Map<string, Set<string>>();
  const directiveNames = new Set<string>();
  const bridgeServiceMembers = new Set<string>();
  const configKeys = new Set<string>();
  const billingKeys = new Set<string>();

  const decoratorCall = (node: ts.Node, name: string): ts.CallExpression | undefined =>
    ts.canHaveDecorators(node)
      ? ts
          .getDecorators(node)
          ?.map((d) => d.expression)
          .find(
            (e): e is ts.CallExpression =>
              ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === name,
          )
      : undefined;

  const memberIO = (cls: ts.ClassDeclaration): Set<string> => {
    const io = new Set<string>();
    for (const m of cls.members) {
      if (!m.name || !ts.isIdentifier(m.name)) continue;
      for (const deco of ['Input', 'Output']) {
        const call = decoratorCall(m, deco);
        if (!call) continue;
        const arg = call.arguments[0];
        if (arg && ts.isStringLiteral(arg)) io.add(arg.text);
        else if (arg && ts.isObjectLiteralExpression(arg)) {
          const alias = arg.properties.find(
            (p): p is ts.PropertyAssignment =>
              ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'alias',
          );
          io.add(alias && ts.isStringLiteral(alias.initializer) ? alias.initializer.text : m.name.text);
        } else io.add(m.name.text);
      }
      // Signal inputs/outputs: `x = input()`, `input.required()`, `model()`, `output()`.
      if (ts.isPropertyDeclaration(m) && m.initializer && ts.isCallExpression(m.initializer)) {
        const callee = m.initializer.expression;
        const fn = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
            ? callee.expression.text
            : '';
        if (['input', 'model', 'output'].includes(fn)) io.add(m.name.text);
      }
    }
    return io;
  };

  // Inputs a component inherits (`extends TranslatableComponent` brings
  // `locale` and `messages`): every class's own inputs and its base class name.
  const ownIO = new Map<string, Set<string>>();
  const baseOf = new Map<string, string>();
  for (const file of program.getSourceFiles()) {
    if (!file.fileName.startsWith(join(SRC, 'lib'))) continue;
    ts.forEachChild(file, function visit(node) {
      if (ts.isClassDeclaration(node) && node.name) {
        ownIO.set(node.name.text, memberIO(node));
        const ext = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
        if (ext && ts.isIdentifier(ext.expression)) baseOf.set(node.name.text, ext.expression.text);
      }
      ts.forEachChild(node, visit);
    });
  }
  const allIO = (cls: string): Set<string> => {
    const io = new Set(ownIO.get(cls) ?? []);
    for (let base = baseOf.get(cls); base; base = baseOf.get(base)) for (const n of ownIO.get(base) ?? []) io.add(n);
    return io;
  };

  for (const file of program.getSourceFiles()) {
    if (!file.fileName.startsWith(join(SRC, 'lib'))) continue;
    ts.forEachChild(file, function visit(node) {
      if (ts.isClassDeclaration(node)) {
        const call = decoratorCall(node, 'Component') ?? decoratorCall(node, 'Directive');
        const meta = call?.arguments[0];
        if (meta && ts.isObjectLiteralExpression(meta)) {
          const sel = meta.properties.find(
            (p): p is ts.PropertyAssignment =>
              ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'selector',
          );
          if (sel && ts.isStringLiteral(sel.initializer)) {
            const io = node.name ? allIO(node.name.text) : memberIO(node);
            for (const part of sel.initializer.text.split(',').map((s) => s.trim())) {
              const attr = /^\[(\w+)\]$/.exec(part);
              if (attr) {
                directiveNames.add(attr[1]);
                for (const name of io) directiveNames.add(name);
              } else if (/^bridge-[\w-]+$/.test(part)) {
                elements.set(part, io);
              }
            }
          }
        }
        if (node.name?.text === 'BridgeService') {
          for (const m of node.members) {
            const isPublic = !(ts.getCombinedModifierFlags(m as ts.Declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected));
            if (m.name && ts.isIdentifier(m.name) && isPublic && !ts.isConstructorDeclaration(m)) {
              bridgeServiceMembers.add(m.name.text);
            }
          }
        }
      }
      if (ts.isInterfaceDeclaration(node) && node.name.text === 'BridgeConfig') {
        for (const m of node.members) {
          if (!m.name || !ts.isIdentifier(m.name)) continue;
          configKeys.add(m.name.text);
          if (m.name.text === 'billing' && ts.isPropertySignature(m) && m.type && ts.isTypeLiteralNode(m.type)) {
            for (const b of m.type.members) if (b.name && ts.isIdentifier(b.name)) billingKeys.add(b.name.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return { exports, elements, directiveNames, bridgeServiceMembers, configKeys, billingKeys };
}

// ── What a guide names ──────────────────────────────────────────────────────

/** Attributes any element may carry, not inputs of the component. */
const NATIVE_ATTRIBUTE = /^(?:class|id|style|title|role|slot|tabindex|hidden|routerLink|ngClass|ngStyle|ngIf|ngFor|ngModel|aria-[\w-]+|data-[\w-]+|attr\.[\w.-]+|class\.[\w-]+|style\.[\w.-]+)$/;

/** Inline-code names that follow this package's naming and must be exported. */
const SDK_NAME = /^(?:[A-Z][A-Za-z0-9]*(?:Component|Directive|Service|Mounter)|(?:provideBridge|inject[A-Z]\w*|create[A-Z]\w*|bridge[A-Z]\w*|flagSignal|evaluateFlag))$/;

/** Names that look like ours but belong to Angular or to the example app. */
const NOT_OURS = new Set(['AppComponent', 'injectContext']);

export type Drift = { line: number; what: string };

/** Iterate a guide's lines with whether each is inside a fenced code block, and the fence language. */
function* lines(markdown: string): Generator<{ text: string; line: number; code: string | null }> {
  let fence: string | null = null;
  const all = markdown.split('\n');
  for (let i = 0; i < all.length; i++) {
    const m = /^\s*(```|~~~)\s*([\w-]*)/.exec(all[i]);
    if (m) {
      fence = fence === null ? m[2] || 'text' : null;
      continue;
    }
    yield { text: all[i], line: i + 1, code: fence };
  }
}

/** The text of every `<bridge-…>` tag, attributes included, across lines and quotes. */
function bridgeTags(markdown: string): Array<{ tag: string; body: string; line: number }> {
  const out: Array<{ tag: string; body: string; line: number }> = [];
  const re = /<(bridge-[\w-]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    let i = m.index + m[0].length;
    let quote: string | null = null;
    while (i < markdown.length) {
      const c = markdown[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>' || c === '`' || c === '\n' && markdown[i + 1] === '\n') break;
      i++;
    }
    out.push({ tag: m[1], body: markdown.slice(m.index + m[0].length, i), line: markdown.slice(0, m.index).split('\n').length });
  }
  return out;
}

function attributeNames(body: string): string[] {
  const names: string[] = [];
  // Strip quoted values so a `>` or `=` inside them is not read as markup.
  const bare = body.replace(/"[^"]*"|'[^']*'/g, '""');
  const re = /(?:^|\s)(\[\(|\[|\(|\*|#)?([\w.-]+)(?:\)\]|\]|\))?(?==|\s|\/|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare))) {
    const [, prefix, name] = m;
    if (prefix === '#' || prefix === '*') continue; // template ref / structural directive on the host
    if (!name || name === '/') continue;
    names.push(name);
  }
  return names;
}

/** Top-level keys (and `billing` keys) of every `…: BridgeConfig = { … }` literal in a code block. */
function configLiteralKeys(code: string): Array<{ key: string; billing: boolean }> {
  const out: Array<{ key: string; billing: boolean }> = [];
  const re = /BridgeConfig\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    let depth = 1;
    let billingDepth = 0;
    let i = m.index + m[0].length;
    let token = '';
    while (i < code.length && depth > 0) {
      const c = code[i];
      if (c === '/' && code[i + 1] === '/') {
        while (i < code.length && code[i] !== '\n') i++;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        const q = c;
        i++;
        while (i < code.length && code[i] !== q) i++;
        i++;
        continue;
      }
      if (c === '{' || c === '[' || c === '(') {
        if (c === '{' && depth === 1 && token === 'billing') billingDepth = depth + 1;
        depth++;
      } else if (c === '}' || c === ']' || c === ')') {
        if (depth === billingDepth) billingDepth = 0;
        depth--;
      } else if (c === ':' && token && (depth === 1 || depth === billingDepth)) {
        out.push({ key: token, billing: depth === billingDepth && depth > 1 });
      } else if (c === ',' && depth === 1) {
        // `appId,` shorthand
      }
      if (/\w/.test(c)) token = /\w/.test(code[i - 1] ?? '') ? token + c : c;
      else if (!/\s/.test(c) && c !== '?') token = c === ':' ? token : '';
      i++;
    }
  }
  return out;
}

export function guideDrift(markdown: string, surface: Surface): Drift[] {
  const out: Drift[] = [];
  const isAngularCode = (lang: string | null) => lang === null || /^(?:ts|typescript|html|angular)$/.test(lang);

  // Imports from the package — in TS code blocks.
  const importRe = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"](@nebulr-group\/bridge-angular[^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(markdown))) {
    const line = markdown.slice(0, m.index).split('\n').length;
    const from = m[3];
    if (from !== PACKAGE) {
      out.push({ line, what: `import from '${from}' — the package has one entry point (only './styles.css' besides it)` });
      continue;
    }
    for (const raw of m[2].split(',')) {
      const name = raw.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name && !surface.exports.has(name)) out.push({ line, what: `import { ${name} } — not exported by ${PACKAGE}` });
    }
  }

  // Elements and their attributes.
  for (const { tag, body, line } of bridgeTags(markdown)) {
    const io = surface.elements.get(tag);
    if (!io) {
      out.push({ line, what: `<${tag}> — no component has this selector` });
      continue;
    }
    for (const name of attributeNames(body)) {
      if (io.has(name) || NATIVE_ATTRIBUTE.test(name)) continue;
      out.push({ line, what: `<${tag} ${name}> — not an input or output of <${tag}>` });
    }
  }

  for (const { text, line, code } of lines(markdown)) {
    // Directives: `*bridgeX` and `[bridgeX]` (attribute selectors and their inputs).
    // A binding has `=` after it (`*bridgeEntitled="…"`, `[bridgeQuotaGate]="…"`);
    // `[bridgeAuthGuard()]` in a route array is not one. In inline code a bare
    // `[bridgeX]` names a selector.
    if (code !== 'bash' && code !== 'sh') {
      const named = [
        ...[...text.matchAll(/\*(bridge[A-Z]\w*)(?==)/g)].map((d) => d[1]),
        ...[...text.matchAll(/\[(bridge[A-Z]\w*)\](?==)/g)].map((d) => d[1]),
        ...(code === null ? [...text.matchAll(/`\[(bridge[A-Z]\w*)\]`/g)].map((d) => d[1]) : []),
      ];
      for (const name of named) {
        if (!surface.directiveNames.has(name)) out.push({ line, what: `${name} — no directive or directive input by that name` });
      }
    }

    const inline = code === null ? [...text.matchAll(/`([^`]+)`/g)].map((x) => x[1]) : [];

    // SDK-looking names in inline code.
    // A sentence that says a name is gone ("replaced a legacy `FooComponent`")
    // is a warning, not drift.
    const retired = code === null && /\b(?:legacy|replaced|superseded|removed|no longer|there is no)\b/i.test(text);
    for (const snippet of retired ? [] : inline) {
      const name = /^(?:\.\.\.)?([A-Za-z_$][\w$]*)(?:\(.*\))?$/.exec(snippet.trim())?.[1];
      if (!name || NOT_OURS.has(name) || !SDK_NAME.test(name)) continue;
      // Lower-case helpers count only when written as a call.
      if (/^[a-z]/.test(name) && !/\(/.test(snippet)) continue;
      if (!surface.exports.has(name)) out.push({ line, what: `\`${snippet}\` — ${name} is not exported by ${PACKAGE}` });
    }

    // `bridge.<member>` — the injected BridgeService. Inline code, and TS/HTML code.
    const bridgeText = code === null ? inline.join(' ') : isAngularCode(code) ? text : '';
    for (const b of bridgeText.matchAll(/(?<![\w.$/-])(?:this\.)?bridge\.([A-Za-z_$][\w$]*)/g)) {
      // `bridge.anon_id` is a storage key, not a member: members are camelCase.
      if (b[1].includes('_')) continue;
      if (!surface.bridgeServiceMembers.has(b[1])) out.push({ line, what: `bridge.${b[1]} — BridgeService has no member ${b[1]}` });
    }

    // `billing.<option>` in inline code.
    for (const snippet of inline) {
      const opt = /^billing\.(\w+)/.exec(snippet.trim());
      if (opt && !surface.billingKeys.has(opt[1])) out.push({ line, what: `\`${snippet}\` — BridgeConfig.billing has no option ${opt[1]}` });
    }
  }

  // Keys of a `BridgeConfig = { … }` literal.
  const blocks = markdown.split(/^\s*```/m).filter((_, i) => i % 2 === 1);
  for (const block of blocks) {
    for (const { key, billing } of configLiteralKeys(block)) {
      const known = billing ? surface.billingKeys : surface.configKeys;
      if (!known.has(key)) {
        const at = markdown.indexOf(block);
        out.push({
          line: markdown.slice(0, at).split('\n').length,
          what: `BridgeConfig${billing ? '.billing' : ''} has no option ${key}`,
        });
      }
    }
  }
  return out;
}

// ── The guides ──────────────────────────────────────────────────────────────

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

const guides = [...markdownFiles(join(REPO, 'mcp')), ...markdownFiles(join(REPO, 'learning')), join(REPO, 'README.md')];
const surface = readSurface();
const read = (f: string) => readFileSync(f, 'utf8');

describe('guide drift: the guides name only what the package has', () => {
  it('reads the package (guards against checking against nothing)', () => {
    expect(surface.exports.has('provideBridge')).toBe(true);
    expect(surface.exports.has('BridgeConfig')).toBe(true); // a type export counts
    expect(surface.elements.get('bridge-feature-flag')?.has('upgrade')).toBe(true);
    expect(surface.elements.get('bridge-team-panel')?.has('seatsMetric')).toBe(true);
    expect(surface.directiveNames.has('bridgeEntitled')).toBe(true);
    expect(surface.bridgeServiceMembers.has('realtimeStatusDetail')).toBe(true);
    expect(surface.billingKeys.has('paywallRoute')).toBe(true);
    expect(guides.length).toBeGreaterThan(10);
  });

  it.each(guides.map((f) => [relative(REPO, f), f]))('%s', (_name, file) => {
    expect(guideDrift(read(file), surface)).toEqual([]);
  });

  describe('goes red on a planted drift', () => {
    it.each([
      ["import { BridgeTeamPanel } from '@nebulr-group/bridge-angular';", 'not exported'],
      ["import { FeatureFlagComponent } from '@nebulr-group/bridge-angular/flags';", 'one entry point'],
      ['<bridge-plan-picker />', 'no component has this selector'],
      ['<bridge-feature-flag key="x" [showUpgrade]="true"></bridge-feature-flag>', 'showUpgrade'],
      ['<bridge-team-panel\n  seatMetric="seats"\n/>', 'seatMetric'],
      ['<bridge-plan-selector (picked)="go($event)" />', 'picked'],
      ['<app-x *bridgeEntitlement="\'a\'" />', 'bridgeEntitlement'],
      ['Mark the slot with `[bridgeFallback]`.', 'bridgeFallback'],
      ['Wrap it with `TeamPanelComponent`.', 'TeamPanelComponent'],
      ['Call `injectPlan()` for the plan.', 'injectPlan'],
      ['Read `bridge.tenant.plan()`… and `bridge.plans()`.', 'BridgeService has no member plans'],
      ['Set `billing.paywallPath`.', 'paywallPath'],
      ['```ts\nconst bridgeConfig: BridgeConfig = {\n  appId: "x",\n  realtimeUrl: "y",\n};\n```', 'no option realtimeUrl'],
      ['```ts\nconst c: BridgeConfig = { appId: "x", billing: { paywall: false } };\n```', 'BridgeConfig.billing has no option paywall'],
    ])('%s', (bad, expected) => {
      const found = guideDrift(bad, surface);
      expect(found.map((d) => d.what).join('\n')).toContain(expected);
    });
  });

  describe('stays green on what the package has', () => {
    it.each([
      "import { FeatureFlagComponent, type BridgeConfig } from '@nebulr-group/bridge-angular';",
      '<bridge-feature-flag key="analytics" [defaultValue]="false" [upgrade]="true" class="x">',
      '<bridge-team-panel seatsMetric="seats" (error)="onError($event)" />',
      '<bridge-login-form [messages]="{ \'login.heading\': \'Hi\' }" />',
      '<app-x *bridgeEntitled="\'analytics\'; else upgrade; loading: wait" />',
      '<button [bridgeQuotaGate]="\'tickets\'">New</button>',
      "```ts\n{ path: '', canActivateChild: [bridgeAuthGuard()], children: [] }\nprovideHttpClient(withInterceptors([bridgeInterceptor]))\n```",
      'This panel replaced a legacy iframe `TeamManagementComponent`; do not copy it.',
      'Use `...bridgeBillingRoutes()` and `bridgeAuthGuard()`; read `bridge.realtimeStatusDetail()`.',
      'Set `billing.paywallRoute` to false; `bridgeConfig.appId` must be set.',
      '```bash\nbridge plan list\n```',
      '```ts\nconst bridgeConfig: BridgeConfig = {\n  appId: environment.bridgeAppId, // the id\n  apiBaseUrl: environment.api || undefined,\n  billing: { paywallRoute: \'/welcome\', manageRoute: \'/subscription\' },\n};\n```',
    ])('%s', (good) => {
      expect(guideDrift(good, surface)).toEqual([]);
    });
  });
});
