// ============================================================================
// Bootstrap & setup
// ============================================================================
export { provideBridge } from './lib/provide-bridge';
export { BridgeBootstrapService } from './lib/bootstrap/bridge-bootstrap.service';

// ============================================================================
// Unified bridge surface (Phase 4/5 parity with bridge-svelte's `bridge`)
// ============================================================================
// `BridgeService` is the Angular equivalent of svelte's unified `bridge` read
// surface. It exposes signals for app / tenant / user / realtimeStatus, the
// dev-attribute write surface (`attributes`), the events dispatcher (`events`),
// and the FF 2.0 flag accessors (`flag()` / `evaluate()`).
export { BridgeService } from './lib/core/bridge.service';
export type {
  BridgeAppSurface,
  BridgeTenantSurface,
} from './lib/core/bridge.service';
export { BridgeRuntimeService } from './lib/core/bridge-runtime.service';
export type { StartBridgeRuntimeOptions } from './lib/core/bridge-runtime.service';

// Session-snapshot reactive types + reducer (advanced consumers).
export type {
  BrandingSnapshot,
  SubscriptionSnapshot,
  UserSnapshot,
  SessionSnapshotData,
} from './lib/core/snapshot-stores';

// Events dispatcher type + handler table.
export type {
  BridgeEventHandlers,
  BridgeEventsDispatcher,
} from './lib/core/events';

// Lazy slice primitive (e.g. `bridge.app.plans`).
export { LazySlice } from './lib/core/lazy-slice';
export type { LazySliceOptions, LoadFn } from './lib/core/lazy-slice';

// Reactive realtime connection status signal.
export { realtimeStatus } from './lib/core/realtime-status';

// ============================================================================
// Services
// ============================================================================
export { BridgeConfigService } from './lib/config/bridge-config.service';
// `AuthService` is now backed by auth-core's `BridgeAuth` (hard-replaced the
// native token-exchange service). Also exported as `BridgeAuthService` for
// naming parity with the other plugins' BridgeAuth surface.
export { AuthService, AuthService as BridgeAuthService } from './lib/shared/services/auth.service';
export type { SubscriptionState } from './lib/shared/services/auth.service';
export { ProfileService } from './lib/profile/profile.service';

// ============================================================================
// Feature Flags 2.0
// ============================================================================
// Declarative component + fallback directive (parity with svelte <FeatureFlag>).
export {
  FeatureFlagComponent,
  BridgeFeatureFlagFallbackDirective,
} from './lib/components/feature-flag/feature-flag.component';

// FF 2.0 bootstrap + browser identity storage (advanced / standalone-FF use).
export {
  createBridgeFlags,
  BrowserIdentityStorage,
} from './lib/flags/bootstrap';
export type {
  CreateBridgeFlagsConfig,
  BridgeFlagsBundle,
} from './lib/flags/bootstrap';

// Non-reactive registry surface — safe in SSR / tests / plain TS contexts.
export {
  evaluateFlag,
  setBridgeFlagsInstance,
  getBridgeFlagsInstance,
  notifyFlagChanged,
  notifyAllFlagsChanged,
  subscribeToFlagChanges,
} from './lib/flags/registry';

// Signal-based reactive flag helper (Angular equivalent of svelte's useFlag).
export { flagSignal } from './lib/flags/flag-reactivity';

// ============================================================================
// Components
// ============================================================================
export { LoginComponent } from './lib/components/login/login.component';

// Profile (parity with svelte ProfileName).
export { ProfileNameComponent } from './lib/components/profile-name/profile-name.component';

// Subscription / Billing 2.0 drop-in components.
export { PlanSelectorComponent } from './lib/components/subscription/plan-selector.component';
export { SubscriptionStatusComponent } from './lib/components/subscription/subscription-status.component';
export { BillingNoticeComponent } from './lib/components/subscription/billing-notice.component';
export { PaywallComponent } from './lib/components/subscription/paywall.component';
export { QuotaBannerComponent } from './lib/components/subscription/quota-banner.component';

// Developer — API token management (parity with svelte ApiTokenManagement).
export { ApiTokenManagementComponent } from './lib/components/developer/api-token-management.component';

// ============================================================================
// SDK Auth — in-app authentication UI (parity with svelte/react sdk-auth).
// Standalone components; selector-cased names per §5.4 (LoginForm →
// bridge-login-form, etc.). All ride the adopted auth-core `BridgeAuth` via
// `AuthService`.
// ============================================================================
export { LoginFormComponent } from './lib/components/sdk-auth/login-form.component';
export { SignupFormComponent } from './lib/components/sdk-auth/signup-form.component';
export { MfaChallengeComponent } from './lib/components/sdk-auth/mfa-challenge.component';
export { MfaSetupComponent } from './lib/components/sdk-auth/mfa-setup.component';
export { TenantSelectorComponent } from './lib/components/sdk-auth/tenant-selector.component';
export { WorkspaceSelectorComponent } from './lib/components/sdk-auth/workspace-selector.component';
export { SsoButtonComponent } from './lib/components/sdk-auth/sso-button.component';
export { SsoProviderIconComponent } from './lib/components/sdk-auth/sso-provider-icon.component';
export { ForgotPasswordComponent } from './lib/components/sdk-auth/forgot-password.component';
export { MagicLinkComponent } from './lib/components/sdk-auth/magic-link.component';
export { PasskeyLoginComponent } from './lib/components/sdk-auth/passkey-login.component';
export { PasskeyRequestSetupLinkComponent } from './lib/components/sdk-auth/passkey-request-setup-link.component';
export { PasskeySetupComponent } from './lib/components/sdk-auth/passkey-setup.component';
export { AuthAlertComponent } from './lib/components/sdk-auth/shared/alert.component';
export { AuthSpinnerComponent } from './lib/components/sdk-auth/shared/spinner.component';
export { AuthFormWrapperComponent } from './lib/components/sdk-auth/shared/auth-form-wrapper.component';

// Billing-store → signal adapters (advanced consumers).
export { createSubscriptionSignal, createQuotaSignal } from './lib/core/billing-signals';
export type { BillingSignal } from './lib/core/billing-signals';

// ============================================================================
// Team management — in-app SDK panel (parity with svelte/react team/**).
// Hard-replaces the legacy iframe/handover `TeamManagementComponent` (§2.6).
// `bridge-team-panel` + subcomponents (selector-cased) ride auth-core's
// `TeamService` via `AuthService.getBridgeAuth().team`.
// ============================================================================
export {
  TeamManagementPanelComponent,
  TeamTabBarDirective,
} from './lib/components/team/team-management-panel.component';
export { TeamUserListComponent } from './lib/components/team/team-user-list.component';
export { TeamProfileFormComponent } from './lib/components/team/team-profile-form.component';
export { TeamWorkspaceFormComponent } from './lib/components/team/team-workspace-form.component';
export { TeamAddUserDialogComponent } from './lib/components/team/team-add-user-dialog.component';
export { TeamEditUserDialogComponent } from './lib/components/team/team-edit-user-dialog.component';
export { TeamUserActionsMenuComponent } from './lib/components/team/team-user-actions-menu.component';
export { TeamConfirmDialogComponent } from './lib/components/team/team-confirm-dialog.component';

// auth-core team surface re-exported so consumers building fully custom team UI
// stay on `@nebulr-group/bridge-angular` without a direct auth-core dependency.
export { TeamService } from '@nebulr-group/bridge-auth-core';
export type {
  TeamProfile,
  TeamProfileUpdateInput,
  TeamUser,
  TeamUserListResult,
  TeamUserUpdateInput,
  TeamWorkspace,
  TeamWorkspaceUpdateInput,
} from '@nebulr-group/bridge-auth-core';

// ============================================================================
// Tracking — Reddit / GA4 conversion tracking via GTM dataLayer (framework-
// agnostic, parity with svelte client/tracking/**). dataLayer-invoked; no UI.
// ============================================================================
export {
  pushConversionEvent,
  pushRedditEvent,
  configureRedditTracking,
} from './lib/tracking/reddit-tracking';
export type {
  RedditConversionEvent,
  RedditUserData,
  RedditEcommerce,
  RedditEcommerceItem,
  PushConversionEventOptions,
  RedditTrackingGate,
} from './lib/tracking/reddit-tracking';
export { sha256Email } from './lib/tracking/pii-hashing';

// ============================================================================
// Guards
// ============================================================================
export { bridgeAuthGuard } from './lib/guards/route-guard';
export type { RouteGuardConfig, RouteRule, FlagRequirement } from './lib/guards/route-guard';

// ============================================================================
// Types
// ============================================================================
export type { BridgeConfig, TokenSet } from './lib/types/config';
export type { Profile, IDToken } from './lib/shared/profile';
export { transformIDToken } from './lib/shared/profile';

// ============================================================================
// Logger
// ============================================================================
export { logger } from './lib/shared/logger';

// ============================================================================
// Feature Flags 2.0 re-exports from auth-core (parity with bridge-svelte) —
// consumers stay on `@nebulr-group/bridge-angular` without a direct auth-core
// dependency.
// ============================================================================
// Evaluator / operator runtime values.
export {
  OPERATORS,
  OPERATOR_VERSION,
  CONDITIONS_PER_RULE_MAX,
  isOperator,
  isOperatorValidForType,
  validOperatorsForType,
  evaluateCondition,
  validateConditions,
  bucket,
  evaluateBranch,
  evaluateRule,
  validateRule,
  resolveAttribute,
} from '@nebulr-group/bridge-auth-core';

// FF 2.0 SDK runtime values.
export {
  BridgeFlags,
  BridgeIdentity,
  MemoryIdentityStorage,
  attachIdentity,
  generateAnonymousId,
  AttributeProviderRegistry,
  AuthAttributeProvider,
  BillingAttributeProvider,
  DevAttributeProvider,
  TelemetryBatcher,
  RealtimeClient,
  BRIDGE_CONTEXT_HEADER,
  serializeContext,
  deserializeContext,
  serverInstanceId,
} from '@nebulr-group/bridge-auth-core';

// FF 2.0 evaluator / SDK types.
export type {
  Operator,
  AttributeType,
  Condition,
  ConditionValue,
  ValidationError,
  Branch,
  Rule,
  FlagState,
  EvalContext,
  EvalResult,
  FlagEvalResult,
  RuleValidationError,
  CachedFlag,
  FlagValueType,
  EvalTelemetry,
  DiscoveryTelemetry,
  BridgeFlagsHooks,
  DeclaredAttributeType,
  AttributeDeclaration,
  BridgeFlagsMode,
  AnonymousTrackingMode,
  IdentityStorage,
  AttributeProvider,
  BillingSnapshot,
  BillingProviderConfig,
  TelemetryBatcherConfig,
  RealtimeClientConfig,
  RealtimeMessage,
  FlagUpdateMessage,
  FlagRemovedMessage,
  UserStateMessage,
  ConnectionState,
  WebSocketLike,
  Plan,
} from '@nebulr-group/bridge-auth-core';

// FF 2.0 management types.
export type {
  FlagResponse,
  CreateFlagInput,
  UpdateFlagInput,
  FlagSchedule,
} from '@nebulr-group/bridge-auth-core';

// ============================================================================
// API tokens (developer) — re-exported from auth-core so consumers stay on
// `@nebulr-group/bridge-angular` without a direct auth-core dependency.
// ============================================================================
export { ApiTokenService } from '@nebulr-group/bridge-auth-core';
export type {
  ApiToken,
  AvailablePrivilege,
  CreateApiTokenInput,
  CreateApiTokenResponse,
} from '@nebulr-group/bridge-auth-core';

// ============================================================================
// Billing 2.0 — auth-core surface re-exports (subscription / quota / plans).
// ============================================================================
export { useBridge, deriveNoticeState, deriveSeverity } from '@nebulr-group/bridge-auth-core';
export type {
  SubscriptionStatus,
  PriceOfferSdk,
  QuotaSnapshot,
  BillingSubscriptionStatus,
  BillingSubscriptionState,
  BillingSubscriptionSnapshot,
  BillingNoticeState,
  BillingSeverity,
  BillingPlanRef,
} from '@nebulr-group/bridge-auth-core';
