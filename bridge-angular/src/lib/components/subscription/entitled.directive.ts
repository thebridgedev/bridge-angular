/**
 * TBP-744 — `*bridgeEntitled`: render when the workspace's plan grants an
 * entitlement. Angular port of bridge-svelte's `<Entitled>` (TBP-703).
 *
 *   <app-analytics *bridgeEntitled="'analytics'; else upgrade; loading: wait" />
 *   <ng-template #upgrade><a routerLink="/subscription">Upgrade for analytics</a></ng-template>
 *   <ng-template #wait>…</ng-template>
 *
 * Until Bridge has answered it renders neither — only the optional `loading`
 * template — so a cold start never flashes the upgrade prompt at a paying
 * workspace, nor the paid feature at a free one.
 *
 * The exception, not the standard: a plan feature is normally gated with
 * `<bridge-feature-flag key="analytics" upgrade>` and a flag ruled
 * `bridge:billing.entitlement.analytics eq true`. In development the first use
 * logs a one-time note saying so (TBP-705).
 */
import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { injectEntitlements, noteDirectPlanCheck } from '../../billing/quota-state';

@Directive({
  selector: '[bridgeEntitled]',
  standalone: true,
})
export class EntitledDirective {
  private readonly key = signal('');
  private readonly elseTpl = signal<TemplateRef<unknown> | null>(null);
  private readonly loadingTpl = signal<TemplateRef<unknown> | null>(null);
  private readonly entitlements = injectEntitlements();

  /** The entitlement key, e.g. `'analytics'`. */
  @Input({ required: true }) set bridgeEntitled(value: string) {
    this.key.set(value);
    noteDirectPlanCheck('entitled', value, isDevMode());
  }

  /** Rendered when Bridge has answered and the plan does not grant the key. */
  @Input() set bridgeEntitledElse(tpl: TemplateRef<unknown> | null) {
    this.elseTpl.set(tpl);
  }

  /** Rendered until Bridge has answered. Nothing by default. */
  @Input() set bridgeEntitledLoading(tpl: TemplateRef<unknown> | null) {
    this.loadingTpl.set(tpl);
  }

  /** Which template shows: the content, the else, the loading one, or none. */
  readonly showing = computed<'granted' | 'denied' | 'loading'>(() => {
    const state = this.entitlements();
    if (!state.ready) return 'loading';
    return state.all[this.key()] === true ? 'granted' : 'denied';
  });

  constructor() {
    const vcr = inject(ViewContainerRef);
    const content = inject(TemplateRef<unknown>);
    let current: TemplateRef<unknown> | null | undefined;
    effect(() => {
      const which = this.showing();
      const tpl = which === 'granted' ? content : which === 'denied' ? this.elseTpl() : this.loadingTpl();
      if (tpl === current) return;
      current = tpl;
      vcr.clear();
      if (tpl) vcr.createEmbeddedView(tpl);
    });
  }
}
