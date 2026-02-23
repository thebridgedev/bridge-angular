import { Injectable, computed, effect, signal } from '@angular/core';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import { BridgeConfigService } from '../config/bridge-config.service';
import { transformIDToken, type IDToken, type Profile } from '../shared/profile';
import { AuthService } from '../shared/services/auth.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly _profile = signal<Profile | null | undefined>(undefined);
  private readonly _error = signal<string | null>(null);

  readonly profile = this._profile.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isOnboarded = computed(() => this._profile()?.onboarded ?? false);
  readonly hasMultiTenantAccess = computed(
    () => this._profile()?.multiTenantAccess ?? false,
  );

  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private expectedIssuer: string | null = null;
  private expectedAudience: string | null = null;

  constructor(
    private authService: AuthService,
    private configService: BridgeConfigService,
  ) {
    // Auto-sync profile whenever tokens change
    effect(() => {
      const idToken = this.authService.tokens()?.idToken ?? null;
      this.updateProfile(idToken).catch((err) =>
        console.error('[ProfileService] updateProfile error:', err),
      );
    });
  }

  private ensureVerifier(): void {
    const config = this.configService.getConfig();
    if (
      !this.jwks ||
      this.expectedIssuer !== config.authBaseUrl ||
      this.expectedAudience !== config.appId
    ) {
      this.jwks = createRemoteJWKSet(
        new URL(`${config.authBaseUrl}/.well-known/jwks.json`),
      );
      this.expectedIssuer = config.authBaseUrl ?? null;
      this.expectedAudience = config.appId ?? null;
    }
  }

  private async verifyToken(idToken: string): Promise<Profile | null> {
    try {
      this.ensureVerifier();
      const { payload } = await jwtVerify(
        idToken,
        this.jwks as NonNullable<typeof this.jwks>,
        {
          issuer: this.expectedIssuer as string,
          audience: this.expectedAudience as string,
        },
      );
      return transformIDToken(payload as unknown as IDToken);
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) {
        this._error.set('Token expired');
      } else if (err instanceof joseErrors.JWTInvalid) {
        this._error.set('Invalid token');
      } else if (err instanceof joseErrors.JWKSNoMatchingKey) {
        this._error.set('JWKS error');
      } else {
        this._error.set('Token verification failed');
      }
      this._profile.set(null);
      return null;
    }
  }

  async updateProfile(idToken: string | null): Promise<void> {
    this._profile.set(undefined); // loading state

    if (!idToken) {
      this._profile.set(null);
      this._error.set(null);
      return;
    }

    const result = await this.verifyToken(idToken);
    this._profile.set(result);
    if (result) this._error.set(null);
  }

  getProfile(): Profile | null | undefined {
    return this._profile();
  }

  clear(): void {
    this._profile.set(null);
    this._error.set(null);
  }
}
