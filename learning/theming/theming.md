# Theming & Styles

## Overview

Bridge components ship with optional default styles. Import them for a ready-to-use appearance, or skip the import entirely for headless usage where you control all styling yourself.

## Importing styles

Add this import to your global stylesheet:

```css
/* src/styles.css */
@import '@nebulr-group/bridge-angular/styles.css';
```

(Or add it to the `styles` array in `angular.json`; either works.)

The stylesheet provides two layers:

- **Structural CSS**: layout, spacing, and sizing that components need to render correctly.
- **Visual defaults**: a minimal but complete out-of-the-box appearance so forms look reasonable with no extra work. These include a visible input border/focus ring, an indigo primary button, and colored error/success alert banners.

## The token contract

The `--bridge-*` variables are the supported way to restyle every Bridge page and component — the same contract as every Bridge plugin (TBP-744). Set them in your own stylesheet on `:root`, or on a wrapper to theme one area. The plugin declares its defaults on `:where(:root)`, which has zero specificity, so **your `:root` wins whichever stylesheet loads first**.

```css
/* src/styles.css */
:root {
  --bridge-primary: #0f766e;
  --bridge-border-radius: 10px;
}
```

| Token | Default | Styles |
|---|---|---|
| `--bridge-primary` | `#4f46e5` | Primary buttons, the selected tab and plan interval, the active workspace |
| `--bridge-primary-hover` | primary, 15% darker | Primary button hover |
| `--bridge-primary-fg` | `#ffffff` | Text on primary surfaces |
| `--bridge-primary-light` | primary at 10% | Tint behind the active workspace |
| `--bridge-input-focus` | primary | Input focus ring |
| `--bridge-bg` | `#ffffff` | Dialogs, menus, panels |
| `--bridge-foreground` | `#111827` | Text on those surfaces, workspace names |
| `--bridge-muted` | `#6b7280` | Secondary text, hints, table headings |
| `--bridge-muted-bg` | `#f3f4f6` | Subtle fills: tab tracks, hovers, the MFA backup code |
| `--bridge-border` | `#d1d5db` | Input, table, card and secondary button borders |
| `--bridge-border-radius` | `6px` | Corners of inputs, buttons, alerts, cards and dialogs |
| `--bridge-overlay` | `rgba(15, 23, 42, 0.45)` | Backdrop behind dialogs |
| `--bridge-alert-error-{bg,fg,border}` | `#fef2f2` / `#991b1b` / `#fca5a5` | Errors, critical billing notices, cancelled plan badge |
| `--bridge-alert-success-{bg,fg,border}` | `#f0fdf4` / `#166534` / `#86efac` | Confirmations, active plan badge |
| `--bridge-alert-info-{bg,fg,border}` | `#eff6ff` / `#1e40af` / `#bfdbfe` | Info notices, trial badge |
| `--bridge-alert-warning-{bg,fg,border}` | `#fffbeb` / `#92400e` / `#fcd34d` | Warnings, a quota nearing its limit, past-due badge |
| `--bridge-auth-page-padding` | `3rem 1rem` | Padding of the sign-in pages `bridgeAuthRoutes()` serves |
| `--bridge-billing-page-width` | `60rem` | Width of the subscription pages and `<bridge-paywall-page>` |
| `--bridge-billing-page-padding` | `3rem 1rem` | Padding of the subscription pages and `<bridge-paywall-page>` |
| `--bridge-paywall-bg` | `rgba(15, 23, 42, 0.72)` | Backdrop of the `<bridge-paywall>` overlay and the billing lockscreen |
| `--bridge-paywall-panel-bg` | `--bridge-bg` | Panel of the `<bridge-paywall>` overlay |

The derived tokens (hover, light, focus) follow `--bridge-primary` wherever you set it, unless you set them too. Two older names still work as deprecated aliases: `--bridge-primary-foreground` for `--bridge-primary-fg`, and `--bridge-bg-muted` for `--bridge-muted-bg`. Fonts and body text colour are not tokens: Bridge pages render inside your layout and inherit them.

## Zero specificity

All visual-default rules use the `:where()` pseudo-class, which has zero specificity. This means any class or element selector in your own CSS wins automatically, no `!important` needed.

For example, the default primary button is styled as:

```css
:where(.bridge-btn-primary) {
  background-color: var(--bridge-primary);
  /* ... */
}
```

Your own `.bridge-btn-primary { background: red; }` or even a simple `.my-button { background: red; }` will override it without specificity battles.

## Component-level overrides

Components expose a `className` input forwarded to their root element, so you can target them directly:

```html
<bridge-login-form className="my-login-form" />
```

```css
.my-login-form input {
  border-radius: 0;   /* square inputs */
}
```

You can also set CSS variables inline via the `style` attribute (custom properties inherit down into the component):

```html
<bridge-login-form style="--bridge-primary: #7c3aed;" />
```

## Data attributes for state-based styling

Bridge components expose data attributes that you can use as CSS selectors for state-based styling:

| Attribute | Values | Description |
|-----------|--------|-------------|
| `[data-active="true"]` | `"true"` | Active tab |
| `[data-loading="true"]` | `"true"` | Loading state |
| `[data-state="active"]` | `"active"` | Active status |
| `[data-state="disabled"]` | `"disabled"` | Disabled status |
| `[data-variant="error"]` | `"error"` | Error variant (alerts) |
| `[data-variant="info"]` | `"info"` | Info variant (alerts) |
| `[data-variant="success"]` | `"success"` | Success variant (alerts) |
| `[data-variant="danger"]` | `"danger"` | Danger variant (alerts) |
| `[data-bridge-plan-selector]` | (none) | Plan selector root |
| `[data-bridge-plan-card]` | (none) | Individual plan card |
| `[data-current="true"]` | `"true"` / `"false"` | Current plan card |
| `[data-bridge-alert]` | (none) | Alert component |
| `[data-bridge-auth-form]` | (none) | Auth form wrapper |
| `[data-bridge-passkey-login]` | (none) | Passkey login button |
| `[data-bridge-sso-button]` | (none) | SSO button |
| `[data-bridge-spinner]` | (none) | Loading spinner |
| `[data-bridge-api-tokens]` | (none) | API token management root |
| `[data-bridge-workspace-selector]` | (none) | Workspace selector root |
| `[data-bridge-workspace-item]` | (none) | Individual workspace item |

Example: style the active workspace differently.

```css
[data-bridge-workspace-item][data-active="true"] {
  background: var(--my-highlight);
  border-color: var(--my-accent);
}
```

## Headless usage

If you manage all styling yourself (e.g. you use Tailwind), skip the import entirely:

```diff
  /* src/styles.css */
- @import '@nebulr-group/bridge-angular/styles.css';
```

Components render as plain, unstyled HTML. Use the `className` input and the data attributes listed above to apply your own styles. The structural layout (flexbox, grid) is embedded in the stylesheet, so without it you have full control over how components are laid out.
