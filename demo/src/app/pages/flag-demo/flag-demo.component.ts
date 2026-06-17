import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FeatureFlagComponent,
  BridgeFeatureFlagFallbackDirective,
} from '@nebulr-group/bridge-angular';

/**
 * Feature Flags 2.0 demo — Angular port of bridge-svelte's `/flag-demo`.
 *
 * Three sections:
 *   A) Simple on/off flag (`simple-flag`).
 *   B) Rule-based flag evaluated against server-known attributes (`role-flag`).
 *   C) Dev-supplied per-call attributes (`plan-flag` with `context.attributes.plan`).
 *
 * Each example is live — admin-UI changes propagate without a page refresh via
 * the shared realtime channel + the FF 2.0 reactivity bridge.
 */
@Component({
  selector: 'app-flag-demo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FeatureFlagComponent,
    BridgeFeatureFlagFallbackDirective,
  ],
  template: `
    <div class="page">
      <div class="container">
        <h1 class="heading-xl">Feature Flags</h1>
        <p class="text-lead">
          Three ways to use feature flags in your app. Each example is live —
          changes in the admin UI propagate here without a page refresh.
        </p>

        <!-- A: Simple toggle -->
        <section class="demo-section">
          <h2 class="heading-lg">A — Simple on/off flag</h2>
          <div class="demo-output">
            <bridge-feature-flag key="simple-flag" [defaultValue]="false">
              <div class="flag-result flag-result--on" data-testid="simple-flag-on">
                ✅ <strong>simple-flag</strong> is <strong>ON</strong>
              </div>
              <div
                class="flag-result flag-result--off"
                data-testid="simple-flag-off"
                *bridgeFeatureFlagFallback
              >
                ⬜ <strong>simple-flag</strong> is <strong>OFF</strong> — create or enable it in admin
              </div>
            </bridge-feature-flag>
          </div>
        </section>

        <!-- B: Rule-based flag -->
        <section class="demo-section">
          <h2 class="heading-lg">B — Rule-based flag</h2>
          <div class="demo-output">
            <bridge-feature-flag key="role-flag" [defaultValue]="false">
              <div class="flag-result flag-result--on" data-testid="role-flag-on">
                ✅ <strong>role-flag</strong> matched — your role satisfies the rule
              </div>
              <div
                class="flag-result flag-result--off"
                data-testid="role-flag-off"
                *bridgeFeatureFlagFallback
              >
                ⬜ <strong>role-flag</strong> did not match — create it with a role rule in admin
              </div>
            </bridge-feature-flag>
          </div>
        </section>

        <!-- C: Dev-supplied per-call attributes -->
        <section class="demo-section">
          <h2 class="heading-lg">C — Dev-supplied attributes</h2>
          <p class="demo-description">
            Your app can pass extra attributes at evaluation time — things the
            server doesn't know about, like a locally-selected plan.
          </p>
          <label>
            Plan:
            <select [ngModel]="plan()" (ngModelChange)="plan.set($event)" data-testid="plan-select">
              <option value="enterprise">enterprise</option>
              <option value="pro">pro</option>
              <option value="free">free</option>
            </select>
          </label>

          <div class="demo-output">
            <bridge-feature-flag
              key="plan-flag"
              [defaultValue]="false"
              [context]="{ attributes: { plan: plan() } }"
            >
              <div class="flag-result flag-result--on" data-testid="plan-flag-on">
                ✅ <strong>plan-flag</strong> matched — plan = {{ plan() }} satisfies the rule
              </div>
              <div
                class="flag-result flag-result--off"
                data-testid="plan-flag-off"
                *bridgeFeatureFlagFallback
              >
                ⬜ <strong>plan-flag</strong> did not match for plan = {{ plan() }}
              </div>
            </bridge-feature-flag>
          </div>
        </section>
      </div>
    </div>
  `,
})
export class FlagDemoComponent {
  readonly plan = signal<'enterprise' | 'pro' | 'free'>('enterprise');
}
