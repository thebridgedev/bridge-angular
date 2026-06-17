import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  BridgeService,
  getBridgeFlagsInstance,
  type CachedFlag,
} from '@nebulr-group/bridge-angular';

/**
 * Dev-supplied per-call attributes demo — drives the
 * `feature-flags/dev-supplied-attributes.spec.ts` (TBP-178) E2E contract.
 *
 * On mount, seeds a local test flag `enterprise-feature`:
 *   state: 'on-with-rule', rule: plan == 'enterprise' → true, otherwise false.
 *
 * Three buttons call `bridge.evaluate(key, default, { attributes: { plan } })`
 * for plan in {enterprise, pro, free} and render the result, proving per-call
 * attributes flow into the evaluator and don't leak between calls.
 *
 * Mirrors the testids the spec asserts on: `cache-ready`, `cache-error`,
 * `eval-enterprise` / `eval-pro` / `eval-free`, `last-plan`, `flag-result`.
 */
@Component({
  selector: 'app-flag-context-demo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="container">
        <h1 class="heading-xl">Per-call flag attributes</h1>

        @if (cacheError()) {
          <p class="flag-result flag-result--off" data-testid="cache-error">
            {{ cacheError() }}
          </p>
        } @else {
          <p data-testid="cache-ready">{{ cacheReady() ? 'ready' : 'loading' }}</p>
        }

        <div class="demo-output">
          <button data-testid="eval-enterprise" (click)="evaluate('enterprise')">
            Evaluate plan=enterprise
          </button>
          <button data-testid="eval-pro" (click)="evaluate('pro')">
            Evaluate plan=pro
          </button>
          <button data-testid="eval-free" (click)="evaluate('free')">
            Evaluate plan=free
          </button>
        </div>

        <p>last plan: <span data-testid="last-plan">{{ lastPlan() }}</span></p>
        <p>result: <span data-testid="flag-result">{{ result() }}</span></p>
      </div>
    </div>
  `,
})
export class FlagContextDemoComponent implements OnInit {
  readonly cacheReady = signal(false);
  readonly cacheError = signal<string | null>(null);
  readonly lastPlan = signal('');
  readonly result = signal('');

  private readonly FLAG_KEY = 'enterprise-feature';

  constructor(private bridge: BridgeService) {}

  ngOnInit(): void {
    try {
      const inst = getBridgeFlagsInstance();
      if (!inst) {
        this.cacheError.set('BridgeFlags instance not available');
        return;
      }
      const flag: CachedFlag = {
        key: this.FLAG_KEY,
        state: 'on-with-rule',
        valueType: 'boolean',
        offValue: false,
        onValue: true,
        rule: {
          branches: [
            {
              conditions: [
                { attribute: 'plan', operator: 'eq', values: ['enterprise'] },
              ],
              returnValue: true,
            },
          ],
          otherwiseValue: false,
          rolloutPct: 100,
        },
      };
      inst.upsert(flag);
      this.cacheReady.set(true);
    } catch (err) {
      this.cacheError.set(err instanceof Error ? err.message : String(err));
    }
  }

  evaluate(plan: 'enterprise' | 'pro' | 'free'): void {
    this.lastPlan.set(plan);
    const res = this.bridge.evaluate<boolean>(this.FLAG_KEY, false, {
      attributes: { plan },
    });
    this.result.set(String(res.value));
  }
}
