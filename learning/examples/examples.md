# Bridge Angular Examples

Here we are showing Bridge features of The Bridge Angular plugin.
You can also see the features in action in our demo application in this monorepo.

To start the demo app:
```bash
# From bridge-angular project root
npm install
cd demo && npx ng serve
```

## Table of Contents
- [Authentication](#authentication)
  - [Renewing User Tokens](#renewing-user-tokens)
  - [Checking Authentication Status](#checking-authentication-status)
  - [Getting User Profile Information](#getting-user-profile-information)
  - [Logout Functionality](#logout-functionality)
  - [Route Protection](#route-protection)
- [Feature Flags](#feature-flags)
  - [Bulk Fetching vs Live Updates](#bulk-fetching-vs-live-updates)
  - [Basic Feature Flag Usage](#basic-feature-flag-usage)
  - [Live Feature Flag Updates](#live-feature-flag-updates)
  - [Conditional Rendering with Feature Flags](#conditional-rendering-with-feature-flags)
  - [Route Protection with Feature Flags](#route-protection-with-feature-flags)
  - [Any vs All Requirements](#any-vs-all-requirements)
  - [Global Flag Plus Per-Route Criteria](#global-flag-plus-per-route-criteria)
  - [Usage Service Pattern for Plan Limits](#usage-service-pattern-for-plan-limits)
  - [UI Components with Feature Flags and Upgrade CTAs](#ui-components-with-feature-flags-and-upgrade-ctas)
- [Payments & Subscriptions](#payments--subscriptions)
  - [Redirecting to Plan Selection](#redirecting-to-plan-selection)
  - [Setting the Security Cookie](#setting-the-security-cookie)
- [Team Management](#team-management)
- [Configuration](#configuration)
  - [Getting Config Values](#getting-config-values)
  - [Available Config Options](#available-config-options)

---

## Authentication

### Route Protection

Bridge protects routes via `bridgeAuthGuard`. Apply it using `canActivateChild` on a parent route so every child is checked automatically:

```ts
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      { path: '', component: HomeComponent },
      { path: 'auth/oauth-callback', component: OAuthCallbackComponent },
      { path: 'protected', component: ProtectedComponent },
    ],
  },
];
```

Configure which routes are public in `app.config.ts`:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(
      { appId: 'YOUR_APP_ID' },
      {
        rules: [
          { match: '/', public: true },
          { match: '/login', public: true },
          { match: /^\/auth\/oauth-callback$/, public: true },
          { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' },
        ],
        defaultAccess: 'protected',
      },
    ),
  ],
};
```

- `defaultAccess`: sets whether unmatched routes are public or protected
- `rules`: mark individual paths as public and/or gate routes behind feature flags
- Redirects are handled automatically

### Renewing User Tokens

Bridge automatically handles token renewal. The `AuthService` refreshes tokens before they expire to ensure a seamless user experience. This happens inside `provideBridge` on startup and continues via auto-refresh.

### Checking Authentication Status

Use `AuthService` to check whether a user is logged in. Services expose Angular signals — call them as functions in templates or via `computed()`.

```ts
// src/app/components/auth-status/auth-status.component.ts
import { Component, inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-auth-status',
  standalone: true,
  template: `
    @if (auth.isLoading()) {
      <div>Loading...</div>
    } @else {
      <div>
        @if (auth.isAuthenticated()) {
          You are logged in!
        } @else {
          Please log in to continue.
        }
      </div>
    }
  `,
})
export class AuthStatusComponent {
  auth = inject(AuthService);
}
```

### Getting User Profile Information

Access the current user's profile using `ProfileService`. The `profile` signal holds `null` (unauthenticated), `undefined` (loading), or a `Profile` object.

```ts
// src/app/components/profile/profile.component.ts
import { Component, inject } from '@angular/core';
import { ProfileService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-profile',
  standalone: true,
  template: `
    @if (profileService.profile() === undefined) {
      <div class="avatar loading">Loading...</div>
    } @else if (profileService.profile()) {
      <div class="profile-details">
        <h2>Your Profile</h2>
        <p><strong>Name:</strong> {{ profileService.profile()!.fullName }}</p>
        <p><strong>Email:</strong> {{ profileService.profile()!.email }}</p>
        <p><strong>Username:</strong> {{ profileService.profile()!.username }}</p>

        @if (profileService.profile()!.tenant) {
          <div style="margin-top: 1rem;">
            <h3>Tenant Information</h3>
            <p><strong>Tenant Name:</strong> {{ profileService.profile()!.tenant!.name }}</p>
            <p><strong>Tenant ID:</strong> {{ profileService.profile()!.tenant!.id }}</p>
          </div>
        }
      </div>
    } @else {
      <div class="avatar">Not logged in</div>
    }
  `,
})
export class ProfileComponent {
  profileService = inject(ProfileService);
}
```

### Logout Functionality

Call `authService.logout()` to clear tokens and redirect to Bridge's logout page:

```ts
// src/app/components/navbar/navbar.component.ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, ProfileService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-navbar',
  standalone: true,
  template: `
    @if (profileService.profile()) {
      <button class="btn-logout" (click)="handleLogout()">
        Logout
      </button>
    }
  `,
})
export class NavbarComponent {
  authService = inject(AuthService);
  profileService = inject(ProfileService);
  router = inject(Router);

  async handleLogout() {
    await this.authService.logout();
    // authService.logout() redirects via window.location — navigation below is a fallback
    await this.router.navigate(['/']);
  }
}
```

---

## Feature Flags

### Bulk Fetching vs Live Updates

Bridge provides two strategies for feature flags:

1. **Bulk Fetching (Recommended)**: All flags are fetched at once and cached for 5 minutes. `FeatureFlagComponent` and `isFeatureEnabled()` use this cache by default.
2. **Live Updates**: Set `forceLive={true}` (component) or pass `forceLive = true` to `isFeatureEnabled()` to bypass the cache and hit the single-flag endpoint.

### Basic Feature Flag Usage

Use `FeatureFlagComponent` to conditionally render content when a flag is enabled:

```ts
// src/app/components/beta-feature/beta-feature.component.ts
import { Component } from '@angular/core';
import { FeatureFlagComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-beta-feature',
  standalone: true,
  imports: [FeatureFlagComponent],
  template: `
    <bridge-feature-flag flagName="beta-feature">
      <div>The "beta-feature" flag is enabled — welcome to beta!</div>
    </bridge-feature-flag>
  `,
})
export class BetaFeatureComponent {}
```

### Live Feature Flag Updates

Pass `[forceLive]="true"` to bypass the 5-minute cache:

```ts
@Component({
  imports: [FeatureFlagComponent],
  template: `
    <bridge-feature-flag flagName="beta-feature" [forceLive]="true">
      <div>This always reflects the real-time state of the flag.</div>
    </bridge-feature-flag>
  `,
})
export class LiveFlagComponent {}
```

### Conditional Rendering with Feature Flags

Use `[negate]="true"` to render content when the flag is **disabled**, or `[renderWhenDisabled]="true"` combined with your own `@if` logic:

```ts
// Show content when a flag is DISABLED
@Component({
  imports: [FeatureFlagComponent],
  template: `
    <bridge-feature-flag flagName="new-ui" [negate]="true">
      <div>You are on the old UI. New UI is coming soon!</div>
    </bridge-feature-flag>
  `,
})
export class OldUiBannerComponent {}
```

For "if/else" style rendering, read the flag imperatively in the component:

```ts
// src/app/components/conditional-feature/conditional-feature.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { FeatureFlagService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-conditional-feature',
  standalone: true,
  template: `
    @if (enabled()) {
      <div class="feature-status active">
        <p>Feature flag "demo-flag" is active</p>
      </div>
    } @else {
      <div class="feature-status">
        "demo-flag" is currently inactive
      </div>
    }
  `,
})
export class ConditionalFeatureComponent implements OnInit {
  private featureFlagService = inject(FeatureFlagService);
  protected enabled = signal(false);

  async ngOnInit() {
    this.enabled.set(await this.featureFlagService.isFeatureEnabled('demo-flag'));
  }
}
```

### Route Protection with Feature Flags

Gate entire routes behind feature flags in your `routeConfig`:

```ts
// src/app/app.config.ts
provideBridge(
  { appId: 'YOUR_APP_ID' },
  {
    rules: [
      { match: '/', public: true },
      { match: '/login', public: true },
      { match: /^\/auth\/oauth-callback$/, public: true },
      { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
      { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' },
    ],
    defaultAccess: 'protected',
  },
)
```

### Any vs All Requirements

Require one of several flags (`any`) or all of them (`all`):

```ts
provideBridge(
  { appId: 'YOUR_APP_ID' },
  {
    rules: [
      // Allowed if any of the flags are enabled
      { match: '/labs/*', featureFlag: { any: ['labs-v1', 'labs-v2'] }, redirectTo: '/' },

      // Allowed only if all flags are enabled
      { match: '/premium/*', featureFlag: { all: ['paid', 'kyc-verified'] }, redirectTo: '/upgrade' },

      { match: '/', public: true },
      { match: /^\/auth\/oauth-callback$/, public: true },
    ],
    defaultAccess: 'protected',
  },
)
```

### Global Flag Plus Per-Route Criteria

To require a global flag "A" for all protected routes, use a catch-all rule at the end. The first matching rule wins — put specific routes first:

```ts
provideBridge(
  { appId: 'YOUR_APP_ID' },
  {
    rules: [
      // Specific route with its own criteria (runs first if it matches)
      { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },

      // Public routes
      { match: '/', public: true },
      { match: '/login', public: true },

      // Global flag: all other protected routes require flag "A"
      { match: '/*', featureFlag: 'A', redirectTo: '/login' },
    ],
    defaultAccess: 'protected',
  },
)
```

Notes:
- Order matters — place specific rules before the global catch-all.
- Public routes bypass feature flag checks entirely.

### Usage Service Pattern for Plan Limits

Feature flags can represent plan capabilities. Combine them with a usage service to enforce per-plan limits:

```ts
// src/app/services/usage.service.ts
import { Injectable, inject } from '@angular/core';
import { FeatureFlagService } from '@nebulr-group/bridge-angular';

export const USAGE_FLAGS = {
  LIMIT_UNLIMITED: 'limit-unlimited',
  LIMIT_10: 'limit-10',
};

export const FLAGS = {
  REGENERATE_ITEM: 'regenerate-item',
  REMOVE_WATERMARK: 'remove-watermark',
  CUSTOM_STYLES: 'custom-styles',
  EXPORT_PDF: 'export-pdf',
  ...USAGE_FLAGS,
};

@Injectable({ providedIn: 'root' })
export class UsageService {
  private featureFlagService = inject(FeatureFlagService);

  getPlanLimit(flags: Record<string, boolean> = {}): number {
    if (flags[USAGE_FLAGS.LIMIT_UNLIMITED]) return Infinity;
    if (flags[USAGE_FLAGS.LIMIT_10]) return 10;
    return 1; // Free tier default
  }

  async canCreate(currentCount: number): Promise<boolean> {
    const flags = this.featureFlagService.flags();
    const limit = this.getPlanLimit(flags);
    if (limit === Infinity) return true;
    return currentCount < limit;
  }
}
```

Check limits before allowing resource creation in a component:

```ts
// src/app/pages/library/library.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { PlanService, ProfileService } from '@nebulr-group/bridge-angular';
import { UsageService } from '../../services/usage.service';

@Component({
  selector: 'app-library',
  standalone: true,
  template: `
    @if (!canCreate()) {
      <div class="upgrade-card">
        <p>You've reached your plan's limit.</p>
        <button class="btn-upgrade" (click)="handleUpgrade()">
          Upgrade to create more
        </button>
      </div>
    }
    <!-- rest of library UI -->
  `,
})
export class LibraryComponent implements OnInit {
  private planService = inject(PlanService);
  private usageService = inject(UsageService);
  protected canCreate = signal(true);

  async ngOnInit() {
    const currentCount = await this.fetchCurrentCount();
    this.canCreate.set(await this.usageService.canCreate(currentCount));
  }

  async handleUpgrade() {
    await this.planService.redirectToPlanSelection();
  }

  private fetchCurrentCount(): Promise<number> {
    // Replace with your actual data-fetching logic
    return Promise.resolve(0);
  }
}
```

### UI Components with Feature Flags and Upgrade CTAs

Disable a button and show an upgrade hint when a flag is off:

```ts
// src/app/components/feature-button/feature-button.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { FeatureFlagService } from '@nebulr-group/bridge-angular';
import { FLAGS } from '../../services/usage.service';

@Component({
  selector: 'app-feature-button',
  standalone: true,
  template: `
    <button
      [disabled]="!enabled()"
      [title]="enabled() ? 'Regenerate' : 'Upgrade to regenerate'"
    >
      Regenerate
      @if (!enabled()) { 🔒 }
    </button>
  `,
})
export class FeatureButtonComponent implements OnInit {
  private featureFlagService = inject(FeatureFlagService);
  protected enabled = signal(false);

  async ngOnInit() {
    this.enabled.set(
      await this.featureFlagService.isFeatureEnabled(FLAGS.REGENERATE_ITEM),
    );
  }
}
```

---

## Payments & Subscriptions

### Redirecting to Plan Selection

The simplest way to send users to Bridge's plan selection page is `PlanService.redirectToPlanSelection()`. It handles the full handover protocol automatically:

```ts
// src/app/components/manage-plan/manage-plan.component.ts
import { Component, inject } from '@angular/core';
import { PlanService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-manage-plan',
  standalone: true,
  template: `
    <button (click)="handleManagePlan()">Manage Plan</button>
  `,
})
export class ManagePlanComponent {
  private planService = inject(PlanService);

  async handleManagePlan() {
    try {
      await this.planService.redirectToPlanSelection();
    } catch (error) {
      console.error('Failed to redirect to plan selection:', error);
    }
  }
}
```

You can also call it inline from navigation:

```ts
@Component({
  imports: [PlanService],
  template: `
    <nav>
      <button class="nav-btn" (click)="planService.redirectToPlanSelection()">
        Manage Plan
      </button>
    </nav>
  `,
})
export class HeaderComponent {
  planService = inject(PlanService);
}
```

`redirectToPlanSelection()` automatically:
- Validates the user is authenticated
- Exchanges the access token for a handover code
- Redirects to Bridge's plan selection page where users can view, upgrade, or downgrade

### Setting the Security Cookie

For flows where you need to redirect to Bridge portals directly (e.g. checkout, subscription portal), set the security cookie first:

```ts
// src/app/components/manage-billing/manage-billing.component.ts
import { Component, inject } from '@angular/core';
import { PlanService, BridgeConfigService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-manage-billing',
  standalone: true,
  template: `
    <button (click)="handleManageBilling()">Manage Billing & Payments</button>
  `,
})
export class ManageBillingComponent {
  private planService = inject(PlanService);
  private configService = inject(BridgeConfigService);

  async handleManageBilling() {
    await this.planService.setSecurityCookie();
    const cloudViewsUrl = this.configService.getConfig().cloudViewsUrl;
    window.location.href = `${cloudViewsUrl}/payments/subscriptionPortal`;
  }
}
```

---

## Team Management

Add team and user management to any page using the `TeamManagementComponent`. It loads the Bridge team management portal in an embedded iframe via the handover protocol — no extra configuration is needed beyond `provideBridge`.

```ts
// src/app/pages/team/team.component.ts
import { Component } from '@angular/core';
import { TeamManagementComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [TeamManagementComponent],
  template: `
    <h1>Team Management</h1>
    <bridge-team-management />
  `,
  styles: [`
    bridge-team-management {
      display: block;
      height: 700px;
    }
  `],
})
export class TeamComponent {}
```

The component handles loading and error states internally.

---

## Configuration

### Getting Config Values

Inject `BridgeConfigService` to read resolved configuration at runtime:

```ts
// src/app/components/config-display/config-display.component.ts
import { Component, inject } from '@angular/core';
import { BridgeConfigService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-config-display',
  standalone: true,
  template: `
    <div>
      <h2>Bridge Configuration</h2>
      <p>App ID: {{ config.appId }}</p>
      <p>Auth Base URL: {{ config.authBaseUrl }}</p>
      <p>Callback URL: {{ config.callbackUrl }}</p>
    </div>
  `,
})
export class ConfigDisplayComponent {
  config = inject(BridgeConfigService).getConfig();
}
```

### Available Config Options

All options are passed as the first argument to `provideBridge()`:

| Option | Description | Default |
|--------|-------------|---------|
| `appId` | Your Bridge application ID | **(Required)** |
| `callbackUrl` | URL to redirect to after login | `window.origin + '/auth/oauth-callback'` |
| `authBaseUrl` | Base URL for Bridge auth services | `https://api.thebridge.dev/auth` |
| `cloudViewsUrl` | Base URL for plans, flags, and payments | `https://api.thebridge.dev/cloud-views` |
| `teamManagementUrl` | URL for the team management portal | `https://api.thebridge.dev/cloud-views/user-management-portal/users` |
| `defaultRedirectRoute` | Route to navigate to after login | `/` |
| `loginRoute` | Route for the login page | `/login` |
| `debug` | Enable verbose debug logging | `false` |

Example with all options:

```ts
provideBridge(
  {
    appId: 'YOUR_APP_ID',
    callbackUrl: 'https://myapp.com/auth/oauth-callback',
    authBaseUrl: 'https://api.thebridge.dev/auth',
    cloudViewsUrl: 'https://api.thebridge.dev/cloud-views',
    teamManagementUrl: 'https://api.thebridge.dev/cloud-views/user-management-portal/users',
    defaultRedirectRoute: '/dashboard',
    loginRoute: '/login',
    debug: false,
  },
  routeConfig,
)
```
