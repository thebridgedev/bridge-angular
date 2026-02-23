
## @nebulr-group/bridge-angular

Bridge Angular library. Add Bridge auth, feature flags, and payments to your Angular 19 apps.

### Install

```bash
npm i @nebulr-group/bridge-angular
```

### Usage

See the `demo/` app in the monorepo for end-to-end wiring.

#### app.config.ts

```ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(
      { appId: 'your-bridge-app-id' },
      {
        rules: [
          { match: '/', public: true },
          { match: /^\/auth\/oauth-callback$/, public: true },
        ],
        defaultAccess: 'protected',
      },
    ),
  ],
};
```

#### app.routes.ts

```ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      { path: '', component: HomeComponent },
      { path: 'auth/oauth-callback', component: OAuthCallbackComponent },
    ],
  },
];
```

### Build

```bash
npm run build
```

Artifacts are emitted to `dist/` via `ng-packagr`.

### Release (branch-protected main)

```bash
# 1) Create release branch
git checkout -b release/v0.1.0
git push -u origin release/v0.1.0

# 2) Open a PR: release/v0.1.0 -> main, approve and merge

# 3) After merge to main, tag and push
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0

# 4) Monitor GitHub Actions "Publish to npm"
```

### License
MIT © thebridgedev
