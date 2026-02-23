import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@nebulr-group/bridge-angular';

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
  ) {}

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) {
      try {
        await this.authService.handleCallback(code);
        const payment = this.route.snapshot.queryParamMap.get('payment');
        await this.router.navigate([payment ? '/' : '/'], {
          queryParams: payment ? { payment } : {},
        });
      } catch (err) {
        console.error('[OAuthCallback] handleCallback error:', err);
        await this.router.navigate(['/']);
      }
    } else {
      await this.router.navigate(['/']);
    }
  }
}
