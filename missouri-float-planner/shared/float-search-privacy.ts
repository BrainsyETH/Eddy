/** Search requests may contain location or town text. Strip them before monitoring. */
export function scrubFloatSearchRequest<
  T extends {
    url?: string;
    data?: unknown;
    query_string?: unknown;
    cookies?: unknown;
    headers?: unknown;
  },
>(request: T): T {
  if (
    request.url &&
    (/\/api\/float-search(?:[/?]|$)/.test(request.url) ||
      /api\.mapbox\.com\/search\/geocode\//.test(request.url))
  ) {
    request.url = request.url.split('?')[0];
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
  if (
    typeof url === 'string' &&
    (/\/api\/float-search(?:[/?]|$)/.test(url) ||
      /api\.mapbox\.com\/search\/geocode\//.test(url))
  ) {
    crumb.data = {
      url: url.split('?')[0],
      method: crumb.data?.method,
      status_code: crumb.data?.status_code,
    };
    delete crumb.message;
  }
  return crumb;
}
