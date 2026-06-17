# Theming

`@nebulr-group/bridge-angular` ships unstyled structural CSS by default. You opt in by
importing the stylesheet once, in your app's global `styles.css`:

```css
/* src/styles.css */
@import '@nebulr-group/bridge-angular/styles.css';
```

(Or add it to the `styles` array in `angular.json` — either works.)

## CSS variables (overridable)

```css
:root {
  --bridge-primary: #4f46e5;
  --bridge-primary-hover: #4338ca;
  --bridge-primary-fg: #ffffff;
  --bridge-border: #d1d5db;
  --bridge-border-radius: 6px;
  --bridge-input-focus: #4f46e5;
  --bridge-alert-error-bg: #fef2f2;
  --bridge-alert-error-fg: #991b1b;
  --bridge-alert-error-border: #fca5a5;
  --bridge-alert-success-bg: #f0fdf4;
  --bridge-alert-success-fg: #166534;
  --bridge-alert-success-border: #86efac;
}
```

Override any of these in your own CSS to match your brand.

## Headless usage (no styles)

Skip the styles import. Components render as plain HTML — target the `data-bridge-*`
attributes with your own selectors:

| Attribute | Component |
|---|---|
| `data-bridge-alert` | `<bridge-auth-alert>` |
| `data-bridge-spinner` | `<bridge-auth-spinner>` |
| `data-bridge-auth-form` | `<bridge-auth-form-wrapper>` |
| `data-bridge-team-panel` | `<bridge-team-panel>` |
| `data-bridge-team-users` | `<bridge-team-user-list>` |
| `data-bridge-team-profile` | `<bridge-team-profile-form>` |
| `data-bridge-team-workspace` | `<bridge-team-workspace-form>` |
| `data-bridge-team-dialog` | team dialogs (add / edit / confirm) |
| `data-bridge-plan-selector` | `<bridge-plan-selector>` |
| `data-bridge-plan-card` | each card in `<bridge-plan-selector>` |
| `data-bridge-sso-button` | `<bridge-sso-button>` |
| `data-bridge-sso-icon` | `<bridge-sso-provider-icon>` |
| `data-bridge-passkey-login` | `<bridge-passkey-login>` |
| `data-bridge-workspace-selector` | `<bridge-workspace-selector>` |
| `data-bridge-api-tokens` | `<bridge-api-token-management>` |

State variants:

| Selector | Meaning |
|---|---|
| `[data-active="true"]` | active tab / workspace |
| `[data-loading="true"]` | request in flight |
| `[data-state="active"]` | active status |
| `[data-state="disabled"]` | disabled status |
| `[data-variant="error"]` | error variant |
| `[data-variant="info"]` | info variant |
| `[data-variant="success"]` | success variant |
| `[data-variant="danger"]` | danger variant |

## Tailwind / custom CSS

The default styles import is plain CSS — it doesn't conflict with Tailwind or your design
system. Override via:

1. CSS variables (preferred for color / radius / border tweaks).
2. Targeting `data-bridge-*` selectors in your own CSS.
3. Passing `className` / `style` inputs (every exported component accepts them).

## Environment variables

All Bridge config is provided via `NG_APP_BRIDGE_*` env vars (or directly in
`app.config.ts`) — see the configuration docs. Theming itself is pure CSS and needs no
env config.
