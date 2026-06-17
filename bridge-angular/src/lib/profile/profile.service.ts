/**
 * `ProfileService` — Angular profile surface, now riding auth-core's BridgeAuth.
 *
 * The legacy implementation verified the id_token locally via JWKS and derived
 * the profile itself. That has been HARD REPLACED: `BridgeAuth` owns profile
 * loading (it fetches/derives the profile and emits `auth:profile`), and
 * `AuthService` exposes it as the `profile` signal. This service is now a thin
 * facade over that signal so existing consumers (`profileService.profile`,
 * `.isOnboarded`, etc.) keep working unchanged.
 */
import { Injectable, computed } from '@angular/core';
import { AuthService } from '../shared/services/auth.service';
import type { Profile } from '../shared/profile';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  constructor(private authService: AuthService) {}

  /** User profile (undefined = loading, null = none, Profile = loaded). */
  readonly profile = computed<Profile | null | undefined>(() => this.authService.profile());
  readonly isOnboarded = computed(() => this.authService.profile()?.onboarded ?? false);
  readonly hasMultiTenantAccess = computed(
    () => this.authService.profile()?.multiTenantAccess ?? false,
  );

  /**
   * Resolves once the profile has loaded (per §2.6 `waitForBridge`), then
   * returns it. Use before reading the profile in code that may run before
   * bootstrap completes.
   */
  async getProfileAsync(): Promise<Profile | null | undefined> {
    await this.authService.waitForBridge();
    return this.authService.profile();
  }

  getProfile(): Profile | null | undefined {
    return this.authService.profile();
  }
}
