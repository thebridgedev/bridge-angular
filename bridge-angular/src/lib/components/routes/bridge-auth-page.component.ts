/**
 * TBP-744 — the component every `bridgeAuthRoutes()` page renders. Angular
 * port of bridge-svelte's `<BridgeAuthRoutes>` body: it reads which page it is
 * from the route and renders that page's form.
 *
 * Not normally used directly — spread `bridgeAuthRoutes()` into the router.
 */
import { Component, OnInit, computed, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { readReturnTo, takeReturnTo, withReturnTo } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { createConfigTranslator } from '../../i18n/translator';
import { resolveBillingPaths } from '../../routing/billing-paths';
import {
  BRIDGE_AUTH_PAGE_DATA,
  BRIDGE_PAGE_OPTIONS_DATA,
  type BridgeAuthPage,
  type BridgePageOptions,
} from '../../routing/bridge-routes';
import { resolveCallbackTarget } from '../../routing/callback';
import { logger } from '../../shared/logger';
import { AuthService } from '../../shared/services/auth.service';
import { ForgotPasswordComponent } from '../sdk-auth/forgot-password.component';
import { LoginFormComponent } from '../sdk-auth/login-form.component';
import { MagicLinkComponent } from '../sdk-auth/magic-link.component';
import { PasskeySetupComponent } from '../sdk-auth/passkey-setup.component';
import { AuthFormWrapperComponent } from '../sdk-auth/shared/auth-form-wrapper.component';
import { SignupFormComponent } from '../sdk-auth/signup-form.component';
import { WorkspaceSelectorComponent } from '../sdk-auth/workspace-selector.component';

/**
 * The URL prefix the pages live under: `/auth` for `/auth/login`. Links between
 * the pages are built from it, so the routes can be spread anywhere.
 */
export function bridgeAuthBase(segments: readonly string[], hasToken: boolean): string {
  const kept = segments.filter((s) => s !== '').slice(0, Math.max(0, segments.length - (hasToken ? 2 : 1)));
  return kept.length ? `/${kept.join('/')}` : '';
}

/** The matched path of a route, from the root, as segments (no query). */
function routeSegments(route: ActivatedRoute): string[] {
  return route.snapshot.pathFromRoot.flatMap((r) => r.url.map((s) => s.path));
}

@Component({
  selector: 'bridge-auth-page',
  standalone: true,
  imports: [
    AuthFormWrapperComponent,
    ForgotPasswordComponent,
    LoginFormComponent,
    MagicLinkComponent,
    PasskeySetupComponent,
    SignupFormComponent,
    WorkspaceSelectorComponent,
  ],
  template: `
    <div class="bridge-auth-page" [attr.data-bridge-auth-route]="page">
      @if (page === 'oauth-callback') {
        <!-- Exchanges the code / confirms the checkout, then navigates away. -->
      } @else if (hosted && !(page === 'workspaces' && auth.isAuthenticated())) {
        <bridge-auth-form-wrapper
          [heading]="headingFor(page) ?? t(page === 'signup' ? 'signup.heading' : 'login.heading')"
          data-bridge-auth-hosted
        >
          <p class="bridge-step-desc">Sign-in for this app happens on its hosted login page, not here.</p>
          @if (hostedHref) {
            <a class="bridge-btn bridge-btn-primary" [attr.href]="hostedHref">
              {{ t(page === 'signup' ? 'signup.submit' : 'login.submit') }}
            </a>
          }
        </bridge-auth-form-wrapper>
      } @else if (page === 'login') {
        <bridge-login-form
          [heading]="headingFor(page) ?? t('login.heading')"
          [signupHref]="base + '/signup'"
          [forgotPasswordHref]="base + '/forgot-password'"
          [magicLinkHref]="base + '/magic-link'"
          [passkeySetupHref]="base + '/setup-passkey'"
          [messages]="options.messages"
          (login)="afterSignIn()"
        />
      } @else if (page === 'signup') {
        <bridge-signup-form
          [showLoginLink]="true"
          [loginHref]="base + '/login'"
          [heading]="headingFor(page) ?? undefined"
          [messages]="options.messages"
        />
      } @else if (page === 'set-password') {
        <bridge-forgot-password
          [token]="token ?? undefined"
          [loginHref]="base + '/login'"
          [heading]="headingFor(page) ?? undefined"
          [messages]="options.messages"
        />
      } @else if (page === 'forgot-password') {
        <bridge-forgot-password
          [loginHref]="base + '/login'"
          [heading]="headingFor(page) ?? undefined"
          [messages]="options.messages"
        />
      } @else if (page === 'magic-link') {
        <bridge-magic-link
          [loginHref]="base + '/login'"
          [heading]="headingFor(page) ?? undefined"
          [messages]="options.messages"
        />
      } @else if (page === 'setup-passkey' && token) {
        <bridge-passkey-setup
          [token]="token"
          [loginHref]="base + '/login'"
          [heading]="headingFor(page) ?? undefined"
          [messages]="options.messages"
          (complete)="afterSignIn()"
        />
      } @else if (page === 'workspaces' && auth.isAuthenticated()) {
        <bridge-auth-form-wrapper [heading]="headingFor(page) ?? t('tenant.chooseHeading')">
          <bridge-workspace-selector [messages]="options.messages" (switched)="afterSignIn()" />
        </bridge-auth-form-wrapper>
      }
    </div>
  `,
})
export class BridgeAuthPageComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly config = inject(BridgeConfigService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly page: BridgeAuthPage = this.route.snapshot.data[BRIDGE_AUTH_PAGE_DATA];
  protected readonly options: BridgePageOptions = this.route.snapshot.data[BRIDGE_PAGE_OPTIONS_DATA] ?? {
    redirectTo: '/',
  };
  protected readonly token: string | null = this.route.snapshot.paramMap.get('token');
  private readonly segments = routeSegments(this.route);
  protected readonly base = bridgeAuthBase(this.segments, this.token !== null);

  /** Hosted mode is "no loginRoute" — the same switch the route guard uses. */
  protected readonly hosted = (() => {
    try {
      return !this.config.getConfig().loginRoute;
    } catch {
      return false;
    }
  })();

  protected readonly hostedHref = (() => {
    if (!this.hosted) return null;
    try {
      const bridge = this.auth.getBridgeAuth();
      return this.page === 'signup' ? bridge.createSignupUrl() : bridge.createLoginUrl();
    } catch {
      return null;
    }
  })();

  private readonly authed = computed(() => this.auth.isAuthenticated());

  constructor() {
    // A magic link returns to the page it was requested from; the sign-in it
    // completes is picked up here. Only a transition counts — a user who was
    // already signed in when the page opened is not bounced away.
    let was = untracked(this.authed);
    effect(() => {
      const now = this.authed();
      if (now && !was && this.page === 'magic-link') untracked(() => this.afterSignIn());
      was = now;
    });
  }

  ngOnInit(): void {
    if (this.page === 'oauth-callback') {
      void this.handleCallback();
      return;
    }
    // The workspace list needs a session; send a signed-out visitor to sign in and back.
    if (this.page === 'workspaces' && !this.hosted && !this.auth.isAuthenticated()) {
      const here = `/${this.segments.join('/')}${currentSearch()}`;
      void this.router.navigateByUrl(withReturnTo(`${this.base}/login`, here), { replaceUrl: true });
    }
  }

  protected t(key: string): string {
    const translate = createConfigTranslator(this.config, this.options.messages);
    return (translate as (k: string) => string)(key);
  }

  protected headingFor(page: BridgeAuthPage): string | null {
    return this.options.heading?.(page) ?? null;
  }

  protected afterSignIn(): void {
    const target = readReturnTo(currentHref()) ?? this.options.redirectTo ?? '/';
    void this.router.navigateByUrl(target);
  }

  private async handleCallback(): Promise<void> {
    const params = new URLSearchParams(currentSearch());
    let paths;
    try {
      paths = resolveBillingPaths(this.config.getConfig().billing);
    } catch {
      paths = resolveBillingPaths(undefined);
    }
    const target = await resolveCallbackTarget(
      params,
      paths,
      {
        handleCallback: (code) => this.auth.handleCallback(code),
        confirmStripeCheckout: (id) => this.auth.confirmStripeCheckout(id),
        refreshBilling: () => this.auth.loadSubscription(),
        takeReturnTo,
        logError: (message, err) => logger.error(message, err),
      },
      this.options.redirectTo ?? '/',
    );
    await this.router.navigateByUrl(target, { replaceUrl: true });
  }
}

function currentHref(): string | null {
  try {
    return typeof window !== 'undefined' ? window.location.href : null;
  } catch {
    return null;
  }
}

function currentSearch(): string {
  try {
    return typeof window !== 'undefined' ? window.location.search : '';
  } catch {
    return '';
  }
}
