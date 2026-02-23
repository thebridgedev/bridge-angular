// Bootstrap & setup
export { provideBridge } from './lib/provide-bridge';
export { BridgeBootstrapService } from './lib/bootstrap/bridge-bootstrap.service';

// Services
export { BridgeConfigService } from './lib/config/bridge-config.service';
export { AuthService } from './lib/shared/services/auth.service';
export { FeatureFlagService } from './lib/shared/services/feature-flag.service';
export { PlanService } from './lib/shared/services/plan.service';
export { ProfileService } from './lib/profile/profile.service';

// Components
export { LoginComponent } from './lib/components/login/login.component';
export { FeatureFlagComponent } from './lib/components/feature-flag/feature-flag.component';
export { TeamManagementComponent } from './lib/components/team-management/team-management.component';

// Guards
export { bridgeAuthGuard } from './lib/guards/route-guard';
export type { RouteGuardConfig, RouteRule, FlagRequirement } from './lib/guards/route-guard';

// Types
export type { BridgeConfig, TokenSet } from './lib/types/config';
export type { Profile, IDToken } from './lib/shared/profile';
export { transformIDToken } from './lib/shared/profile';

// Logger
export { logger } from './lib/shared/logger';
