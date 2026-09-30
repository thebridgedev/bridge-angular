import type { ActivatedRouteSnapshot } from '@angular/router';

/**
 * The matched path of a route, from the root, as segments (no query). Read from
 * the route itself because `Router.url` still holds the previous URL while the
 * first navigation activates its components.
 */
export function routeSegments(snapshot: ActivatedRouteSnapshot | null | undefined): string[] {
  const segments: string[] = [];
  for (const r of snapshot?.pathFromRoot ?? []) {
    for (const s of r.url) segments.push(s.path);
  }
  return segments;
}
