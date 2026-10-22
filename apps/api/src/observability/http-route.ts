import { Request } from 'express';

export const UNMATCHED_ROUTE = '/[unmatched]';

// Route definitions are application metadata. Raw paths and URLs may contain
// credentials or PII, including when a request does not match any controller.
export function httpRoute(request: Request): string {
  const route: unknown = request.route;
  const path =
    route && typeof route === 'object'
      ? (route as { path?: unknown }).path
      : undefined;
  // Nest's request-id middleware may leave its catch-all as req.route for 404s.
  return typeof path === 'string' && path !== '/{*path}'
    ? path
    : UNMATCHED_ROUTE;
}
