/**
 * `<bridge-feature-flag>` — declarative Feature Flags 2.0 component for Angular.
 * Angular port of bridge-svelte's `flags/FeatureFlag.svelte`.
 *
 * Renders projected content when Bridge's rule passed (flag on for this user),
 * else renders the fallback slot. Reactive — re-renders when the flag changes
 * in the cache (realtime push, token change, dev-attribute change).
 *
 * Two content slots (Angular content projection):
 *   - default slot — rendered when the flag passed.
 *   - `*bridgeFeatureFlagFallback` structural directive — rendered when off.
 *
 * Inputs mirror svelte's `<FeatureFlag>`:
 *   - `key` (required) — the flag key.
 *   - `defaultValue` — value when no rule matched / cache cold. Default `false`.
 *   - `context` — optional per-call EvalContext for dev-supplied attributes.
 *
 * Usage:
 *   <bridge-feature-flag key="new-dashboard" [defaultValue]="false">
 *     <new-dashboard />
 *     <p *bridgeFeatureFlagFallback>Coming soon</p>
 *   </bridge-feature-flag>
 */
import {
  Component,
  ContentChild,
  Directive,
  Input,
  TemplateRef,
  computed,
  signal,
  type Signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { EvalContext, FlagEvalResult } from '@nebulr-group/bridge-auth-core';
import { BridgeService } from '../../core/bridge.service';

/** Structural directive marking the fallback slot of `<bridge-feature-flag>`. */
@Directive({
  selector: '[bridgeFeatureFlagFallback]',
  standalone: true,
})
export class BridgeFeatureFlagFallbackDirective {
  constructor(public templateRef: TemplateRef<unknown>) {}
}

@Component({
  selector: 'bridge-feature-flag',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (result().passed) {
      <ng-content></ng-content>
    } @else if (fallback) {
      <ng-container [ngTemplateOutlet]="fallback.templateRef"></ng-container>
    }
  `,
})
export class FeatureFlagComponent<T = boolean> {
  private readonly _key = signal<string>('');
  private readonly _defaultValue = signal<T>(false as unknown as T);
  private readonly _context = signal<Partial<EvalContext> | undefined>(undefined);

  /** The flag key. */
  @Input({ required: true }) set key(value: string) {
    this._key.set(value);
  }

  /** Value when no rule matched / cache cold. */
  @Input() set defaultValue(value: T) {
    this._defaultValue.set(value);
  }

  /** Optional per-call EvalContext (dev-supplied attributes win on collision). */
  @Input() set context(value: Partial<EvalContext> | undefined) {
    this._context.set(value);
  }

  /** Optional fallback slot, rendered when the flag is off. */
  @ContentChild(BridgeFeatureFlagFallbackDirective)
  fallback?: BridgeFeatureFlagFallbackDirective;

  /** Reactive evaluation result — re-runs whenever the flag changes. */
  protected readonly result: Signal<FlagEvalResult<T>>;

  constructor(private bridge: BridgeService) {
    this.result = computed(() => {
      // Reactive dependency on the flag-cache version map so this re-runs on
      // every flag change (realtime, token, dev-attribute).
      this.bridge._flagVersions();
      const key = this._key();
      const def = this._defaultValue();
      const ctx = this._context();
      if (!key) return { passed: false, value: def };
      return this.bridge.evaluate<T>(key, def, ctx);
    });
  }
}
