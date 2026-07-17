import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, BridgeConfigService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  template: `
    <div style="padding: 2rem; text-align: center;">
      <h1>Signing you in…</h1>
      <p>You'll be redirected shortly.</p>
      <p style="opacity: 0.6; font-size: 0.9rem;">
        If nothing happens, you can return to the home page.
      </p>
      <p><a href="/">Go to home</a></p>
    </div>
  `,
})
export class OAuthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private configService: BridgeConfigService,
  ) {}

  /**
   * Where a failed Stripe checkout confirmation lands. Honors the SDK's
   * `billing.paymentErrorRoute` config, falling back to '/payment-error'
   * (mirrors bridge-svelte's `getConfig().billing?.paymentErrorRoute ??
   * '/payment-error'`).
   */
  private get paymentErrorRoute(): string {
    try {
      return this.configService.getConfig().billing?.paymentErrorRoute ?? '/payment-error';
    } catch {
      return '/payment-error';
    }
  }

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const sessionId = params.get('session_id');
    const stripeSuccess = params.has('stripe_success');
    const stripeCancel = params.has('stripe_cancel');
    // The destination the selector asked us to land on after confirming. Stripe
    // only substitutes {CHECKOUT_SESSION_ID} in the success_url; it does not
    // touch our `redirect` param, so its own query (e.g. ?payment=success) is
    // preserved verbatim.
    const stripeRedirectTo = params.get('redirect') || '/subscription';

    try {
      // Stripe Checkout return — confirm the session with bridge-api (which
      // verifies it with Stripe server-side), refresh tokens so the new JWT
      // reads shouldSelectPlan:false, reload the subscription store, then
      // redirect. Mirrors bridge-react's CallbackHandler.
      if (stripeSuccess && sessionId) {
        const bridge = this.authService.getBridgeAuth();
        const ctx = bridge.getApiContext();
        const res = await fetch(`${ctx.apiBaseUrl}/v1/account/stripe/confirm-checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(ctx.accessToken ? { Authorization: `Bearer ${ctx.accessToken}` } : {}),
          },
          body: JSON.stringify({ sessionId, appId: ctx.appId }),
        });
        if (!res.ok) {
          await this.router.navigateByUrl(this.paymentErrorRoute);
          return;
        }
        await bridge.refreshTokens();
        await this.authService.loadSubscription().catch(() => {});
        await this.router.navigateByUrl(stripeRedirectTo);
        return;
      }
      if (stripeCancel) {
        await this.router.navigateByUrl(stripeRedirectTo);
        return;
      }

      if (code) {
        await this.authService.handleCallback(code);
        const payment = params.get('payment');
        await this.router.navigate(['/'], {
          queryParams: payment ? { payment } : {},
        });
        return;
      }

      await this.router.navigate(['/']);
    } catch (err) {
      console.error('[OAuthCallback] callback error:', err);
      if (stripeSuccess) {
        await this.router.navigateByUrl(this.paymentErrorRoute);
        return;
      }
      await this.router.navigate(['/']);
    }
  }
}
