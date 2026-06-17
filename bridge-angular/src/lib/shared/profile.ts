// Profile shape mirrors auth-core's `Profile` (BridgeAuth emits it). Kept as a
// local interface so it stays a public export of the plugin; structurally
// identical to `@nebulr-group/bridge-auth-core`'s `Profile`.
export interface IDToken {
  sub: string;
  preferred_username: string;
  email: string;
  email_verified: boolean;
  name: string;
  family_name?: string;
  given_name?: string;
  locale?: string;
  onboarded?: boolean;
  multi_tenant?: boolean;
  tenant_id?: string;
  tenant_name?: string;
  tenant_locale?: string;
  tenant_logo?: string;
  tenant_onboarded?: boolean;
}

export interface Profile {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  familyName?: string;
  givenName?: string;
  locale?: string;
  onboarded?: boolean;
  multiTenantAccess?: boolean;
  tenant?: {
    id: string;
    name: string;
    locale?: string;
    logo?: string;
    onboarded?: boolean;
  };
}

export function transformIDToken(payload: IDToken): Profile {
  return {
    id: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    emailVerified: payload.email_verified,
    fullName: payload.name,
    familyName: payload.family_name,
    givenName: payload.given_name,
    locale: payload.locale,
    onboarded: payload.onboarded,
    multiTenantAccess: payload.multi_tenant,
    tenant: payload.tenant_id
      ? {
          id: payload.tenant_id,
          name: payload.tenant_name || '',
          locale: payload.tenant_locale,
          logo: payload.tenant_logo,
          onboarded: payload.tenant_onboarded,
        }
      : undefined,
  };
}
