<p align="center">
  <a href="https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thebridgedev/bridge-angular/main/.github/assets/banner.png"><img src="https://raw.githubusercontent.com/thebridgedev/bridge-angular/main/.github/assets/banner-light.png" alt="The Bridge for Angular" width="100%"></picture></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nebulr-group/bridge-angular"><img src="https://img.shields.io/npm/v/@nebulr-group/bridge-angular?color=20006b&label=npm" alt="npm version"></a>
  <a href="https://github.com/thebridgedev/bridge-angular/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@nebulr-group/bridge-angular?color=20006b" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular"><b>Website</b></a> ·
  <a href="https://thebridge.dev/docs/quickstart/angular/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular"><b>Quickstart</b></a> ·
  <a href="https://thebridge.dev/docs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular"><b>Docs</b></a> ·
  <a href="https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular"><b>Set up with your AI assistant</b></a>
</p>

# The Bridge for Angular

`@nebulr-group/bridge-angular` adds sign-in, workspaces and roles, feature flags, Stripe subscriptions and plan limits to an Angular 19 app, with providers, route helpers and one stylesheet.

**[The Bridge](https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular)** is a hosted backend for SaaS apps. It gives you sign-in (passwords, magic links, passkeys, social login and SSO), multi-tenant workspaces with roles, Stripe subscriptions with plan limits, and feature flags, all managed from one dashboard. Your AI coding assistant can set it up for you through the [Bridge MCP server](https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular).

> **Let your AI assistant set it up.** Connect the [Bridge MCP server](https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular) to Claude, Cursor, Copilot or Gemini CLI and ask it to add Bridge to your app. Not using MCP? Run `npx @nebulr-group/bridge-cli guide add-login` in your project: it detects your framework from `package.json` and prints the steps for your assistant to follow. `npx @nebulr-group/bridge-cli doctor` checks the result.

## Install

```bash
npm i @nebulr-group/bridge-angular
```

## The whole integration

See the [demo app](https://github.com/thebridgedev/bridge-angular/tree/main/demo) for end-to-end wiring, and [How Bridge works](https://github.com/thebridgedev/bridge-angular/blob/main/learning/mechanisms.md) for the rules on one page.

### app.config.ts

```ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { bridgeInterceptor, provideBridge } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([bridgeInterceptor])), // your API calls carry the token; a plan-limit 402 opens the upgrade dialog
    provideBridge({ appId: environment.bridgeAppId, loginRoute: '/auth/login' }),
  ],
};
```

### app.routes.ts

```ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard, bridgeAuthRoutes, bridgeBillingRoutes } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  ...bridgeAuthRoutes(),               // login, signup, OAuth callback, set password, magic link, passkey setup, workspaces
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      ...bridgeBillingRoutes(),        // /subscription, the paywall /subscription/plan, checkout returns
      { path: '', component: HomeComponent },
    ],
  },
];
```

### styles.css

```css
@import '@nebulr-group/bridge-angular/styles.css';
```

Configuration is code (Angular has no env-var convention): each option resolves as *explicit option > default*, an empty string is unset, a missing `appId` throws naming it, and `hostedUrl` follows `apiBaseUrl` on Bridge's domains.

Plan limits, lowest level first: level 0 needs nothing (the upgrade dialog opens on a `402` from your backend); level 1 is `<bridge-quota-gate metric="…">` / `[bridgeQuotaGate]` and `<bridge-feature-flag key="…" [upgrade]="true">`; level 2 is `injectQuota(metric)` / `injectEntitlements()`.

## Learn more

- [Quickstart](https://thebridge.dev/docs/quickstart/angular/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular)
- [Authentication](https://thebridge.dev/docs/auth/angular/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular)
- [Sign-in inside your app](https://thebridge.dev/docs/sdk-auth/angular/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular)
- [Feature flags](https://thebridge.dev/docs/feature-flags/angular/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular)
- [Branding](https://thebridge.dev/docs/branding/angular/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular)
- [Live updates](https://thebridge.dev/docs/live-updates/angular/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular)
- [Subscriptions and plan limits](https://thebridge.dev/docs/billing/how-it-works/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular)

## Other Bridge packages

| Package | For |
|---|---|
| [`@nebulr-group/bridge-svelte`](https://www.npmjs.com/package/@nebulr-group/bridge-svelte) | SvelteKit |
| [`@nebulr-group/bridge-react`](https://www.npmjs.com/package/@nebulr-group/bridge-react) | React |
| [`@nebulr-group/bridge-nextjs`](https://www.npmjs.com/package/@nebulr-group/bridge-nextjs) | Next.js |
| [`@nebulr-group/bridge-nestjs`](https://www.npmjs.com/package/@nebulr-group/bridge-nestjs) | NestJS |
| [`@nebulr-group/bridge-express`](https://www.npmjs.com/package/@nebulr-group/bridge-express) | Express |
| [`@nebulr-group/bridge-cli`](https://www.npmjs.com/package/@nebulr-group/bridge-cli) | CLI for people and AI agents |
| [`@nebulr-group/bridge-auth-core`](https://www.npmjs.com/package/@nebulr-group/bridge-auth-core) | Any JavaScript app (core) |

## License

[MIT](https://github.com/thebridgedev/bridge-angular/blob/main/LICENSE) © Nebulr. Built by [The Bridge](https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-angular).
