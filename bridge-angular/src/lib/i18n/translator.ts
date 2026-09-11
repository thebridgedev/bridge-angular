/**
 * Translator access for the SDK auth components (TBP-630/TBP-633).
 *
 * Reads `locale` / `messages` off BridgeConfig so an app sets the language ONCE
 * in `provideBridge()` rather than passing it to every component, and layers a
 * component-level `messages` input on top for per-screen wording.
 *
 * Mirrors bridge-svelte's `client/stores/i18n.ts` — same precedence, same
 * fallback, same key set. The catalogue itself lives in auth-core precisely so
 * a translation fixed once is fixed in every framework package.
 */
import { Directive, Input, inject } from '@angular/core';
import {
  createTranslator,
  type MessageOverrides,
  type Translator,
} from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../config/bridge-config.service';

/**
 * Build a translator from config, with an optional per-component override.
 *
 * `getConfig()` throws when `provideBridge()` has not run. These components can
 * render before that in a test harness or a stray import, and a login form
 * rendered in English is a far better failure than one that throws because
 * nobody configured the app — so the catch falls back to the default (English)
 * translator rather than propagating.
 *
 * Angular components re-read this on each change-detection pass via a
 * `t(key, vars)` method rather than caching a closure, so a `messages` input
 * that arrives after construction is picked up.
 */
export function createConfigTranslator(
  configService: BridgeConfigService,
  messages?: MessageOverrides,
): Translator {
  try {
    const { locale, messages: configMessages } = configService.getConfig();
    return createTranslator({
      locale,
      messages: { ...configMessages, ...messages },
    });
  } catch {
    return createTranslator({ messages });
  }
}

/**
 * Base class for the SDK auth components.
 *
 * Angular has no equivalent of svelte's `$derived`, and repeating the
 * inject + try/catch + spread in nine components is nine chances to get the
 * precedence wrong. Components extend this and call `this.t('key')` from their
 * template.
 *
 * Declared as an abstract `@Directive()` rather than a plain class so the
 * `messages` input is INHERITED. A subclass re-declaring `@Input() messages`
 * shadows this one, which TypeScript rightly rejects (TS2612) — and the
 * workarounds for that error (`declare`, an initializer) both put the input
 * back in nine places, which is the repetition this class exists to remove.
 */
@Directive()
export abstract class TranslatableComponent {
  /** Per-key copy overrides for this component only (TBP-630). */
  @Input() messages?: MessageOverrides;

  private readonly configService = inject(BridgeConfigService);

  /**
   * Resolve a key, substituting `{name}` placeholders from `vars`.
   *
   * Deliberately NOT memoised: `messages` is an `@Input()` that can change after
   * construction, and a cached translator would keep serving the copy the
   * component was born with. The lookup is a property access on a bundled
   * object — cheaper than the machinery to avoid repeating it.
   */
  t(key: Parameters<Translator>[0], vars?: Parameters<Translator>[1]): string {
    return createConfigTranslator(this.configService, this.messages)(key, vars);
  }
}
