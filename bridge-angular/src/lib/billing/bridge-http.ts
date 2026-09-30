/**
 * TBP-744 — level 0 of plan limits: the app's own HTTP calls carry the user's
 * token, and a plan-limit refusal from its backend opens the upgrade dialog,
 * with no Bridge code on the page.
 *
 *   // app.config.ts
 *   provideHttpClient(withInterceptors([bridgeInterceptor])),
 *
 * `bridgeInterceptor` (HttpClient) and `bridgeFetch()` (plain fetch) do the
 * same three things, mirroring bridge-svelte's `bridgeFetch`:
 *   1. add `Authorization: Bearer <access token>` when signed in — only for the
 *      page's own origin, Bridge's API and `billing.apiOrigins`, never for a
 *      third-party URL (the interceptor sees every request the app makes);
 *   2. on a `401`, refresh the token once and retry;
 *   3. on a `402` whose body is `QUOTA_EXCEEDED` (bridge-nestjs `@RequireQuota`)
 *      or `FEATURE_NOT_IN_PLAN`, open the upgrade dialog. The error still
 *      reaches the caller unchanged.
 */
import { HttpErrorResponse, type HttpEvent, type HttpHandlerFn, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, throwError, type Observable } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { BridgeConfigService } from '../config/bridge-config.service';
import { PRODUCTION_API_BASE_URL } from '../config/resolve-config';
import { AuthService } from '../shared/services/auth.service';
import { observeRefusalBody, watchesOrigin } from './quota-refusal';

function pageOrigin(): string | undefined {
  try {
    return typeof window !== 'undefined' ? window.location.origin : undefined;
  } catch {
    return undefined;
  }
}

function absolute(url: string): string {
  try {
    return new URL(url, pageOrigin()).href;
  } catch {
    return url;
  }
}

/** The origins the token may go to, from the running config. */
function watchedOptions(config: BridgeConfigService | null): {
  pageOrigin?: string;
  apiBaseUrl?: string;
  apiOrigins?: readonly string[];
} {
  let apiBaseUrl = PRODUCTION_API_BASE_URL;
  let apiOrigins: readonly string[] | undefined;
  try {
    const cfg = config?.getConfig();
    apiBaseUrl = cfg?.apiBaseUrl ?? PRODUCTION_API_BASE_URL;
    apiOrigins = cfg?.billing?.apiOrigins;
  } catch {
    /* not bootstrapped — page origin and production API only */
  }
  return { pageOrigin: pageOrigin(), apiBaseUrl, apiOrigins };
}

/**
 * The Bridge interceptor for `HttpClient`. Add it once:
 * `provideHttpClient(withInterceptors([bridgeInterceptor]))`.
 */
export const bridgeInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const auth = inject(AuthService);
  const config = inject(BridgeConfigService, { optional: true });
  const url = absolute(req.urlWithParams);
  if (!watchesOrigin(url, watchedOptions(config))) return next(req);

  const tokenOf = (): string | undefined => {
    try {
      return auth.getToken()?.accessToken ?? undefined;
    } catch {
      return undefined;
    }
  };
  const withToken = (token: string | undefined): HttpRequest<unknown> =>
    token && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  const observe402 = (err: unknown): void => {
    if (err instanceof HttpErrorResponse && err.status === 402) {
      let body: unknown = err.error;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = null;
        }
      }
      observeRefusalBody(body, url);
    }
  };

  const sent = tokenOf();
  return next(withToken(sent)).pipe(
    catchError((err: unknown) => {
      // A token that expired mid-session is not an error the page handles:
      // refresh once and retry. Only when we sent one and the caller did not
      // bring their own Authorization header.
      if (err instanceof HttpErrorResponse && err.status === 401 && sent && !req.headers.has('Authorization')) {
        return from(auth.refreshToken().catch(() => null)).pipe(
          switchMap((fresh) => {
            const freshToken = fresh?.accessToken ?? tokenOf();
            if (!freshToken || freshToken === sent) return throwError(() => err);
            return next(withToken(freshToken)).pipe(
              catchError((retryErr: unknown) => {
                observe402(retryErr);
                return throwError(() => retryErr);
              }),
            );
          }),
        );
      }
      observe402(err);
      return throwError(() => err);
    }),
  );
};

let _authForFetch: AuthService | null = null;

/** Set by the bootstrap so `bridgeFetch()` works outside an injection context. */
export function setBridgeFetchAuth(auth: AuthService | null): void {
  _authForFetch = auth;
}

/**
 * `fetch` for calls to **your own backend** that carry the signed-in user's
 * token, retry once on a `401`, and open the upgrade dialog on a plan-limit
 * `402`. Same signature as `fetch`; the response is returned unchanged.
 *
 * It sends the user's token to whatever URL you give it, so call it for your
 * backend only. With `HttpClient`, use `bridgeInterceptor` instead.
 */
export async function bridgeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const auth = _authForFetch;
  const withToken = (token: string | undefined): RequestInit => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  };

  let sentToken: string | undefined;
  try {
    sentToken = auth?.getToken()?.accessToken ?? undefined;
  } catch {
    sentToken = undefined;
  }
  let response = await fetch(input, withToken(sentToken));

  const replayable =
    !(typeof Request !== 'undefined' && input instanceof Request) &&
    !(typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream);
  if (response.status === 401 && sentToken && auth && replayable) {
    const fresh = await auth.refreshToken().catch(() => null);
    const freshToken = fresh?.accessToken ?? auth.getToken()?.accessToken ?? undefined;
    if (freshToken && freshToken !== sentToken) response = await fetch(input, withToken(freshToken));
  }

  if (response.status === 402) {
    try {
      const body: unknown = await response.clone().json();
      observeRefusalBody(body, absolute(url));
    } catch {
      /* not JSON — not a refusal */
    }
  }
  return response;
}
