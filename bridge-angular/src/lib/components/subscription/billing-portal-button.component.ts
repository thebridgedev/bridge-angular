/**
 * TBP-744 — `<bridge-billing-portal-button>`: opens the workspace's Stripe
 * billing portal (payment method, invoices, cancel). Angular port of
 * bridge-svelte's `<BillingPortalButton>` (TBP-702).
 *
 * Fetches a one-time portal URL at click time (the session is short-lived, so
 * it is never cached) and follows it. Renders only for someone who can act on
 * it: the workspace owner (`canManageBilling()`), on an app with payments on,
 * whose workspace already has a plan.
 */
import { Component, Input, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'bridge-billing-portal-button',
  standalone: true,
  template: `
    @if (visible()) {
      @if (failure()) {
        <div class="bridge-alert bridge-alert-error" role="alert">{{ failure() }}</div>
      }
      <button
        type="button"
        class="bridge-btn-secondary bridge-billing-portal-btn"
        [class]="className"
        data-bridge-billing-portal
        [disabled]="opening()"
        (click)="openPortal()"
      >
        {{ label }}
      </button>
    }
  `,
})
export class BillingPortalButtonComponent {
  /** The button text. */
  @Input() label = 'Manage billing';
  @Input() className = '';

  private readonly auth = inject(AuthService);
  protected readonly opening = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const status = this.auth.subscription().status;
    if (!this.auth.isAuthenticated() || !status) return false;
    let canManage = false;
    try {
      canManage = this.auth.getBridgeAuth().canManageBilling() === true;
    } catch {
      canManage = false;
    }
    return canManage && !!status.paymentsEnabled && !status.shouldSelectPlan;
  });

  protected async openPortal(): Promise<void> {
    this.opening.set(true);
    this.failure.set(null);
    try {
      window.location.href = await this.auth.getBridgeAuth().getBillingPortalUrl();
    } catch (err) {
      this.failure.set(err instanceof Error ? err.message : 'Could not open the billing portal');
      this.opening.set(false);
    }
  }
}
