/** Search and local-weather requests contain location. Strip them before monitoring.
 * Keep the existing exports so all web and native Sentry hooks share this boundary.
 */
function containsLocation(url: string): boolean {
  return /\/api\/(?:float-search|weather\/forecast)(?:[/?#]|$)/.test(url) ||
    /api\.mapbox\.com\/search\/geocode\//.test(url);
}

export function scrubFloatSearchRequest<
  T extends {
    url?: string;
    data?: unknown;
    query_string?: unknown;
    cookies?: unknown;
    headers?: unknown;
  },
>(request: T): T {
  if (request.url && containsLocation(request.url)) {
    request.url = request.url.split(/[?#]/)[0];
    delete request.data;
    delete request.query_string;
    delete request.cookies;
    delete request.headers;
  }
  return request;
}
export function scrubFloatSearchBreadcrumb<
  T extends { data?: Record<string, unknown>; message?: string },
>(crumb: T): T {
  const url = crumb.data?.url;
  if (typeof url === 'string' && containsLocation(url)) {
    crumb.data = {
      url: url.split(/[?#]/)[0],
      method: crumb.data?.method,
      status_code: crumb.data?.status_code,
    };
    delete crumb.message;
  }
  return crumb;
}
