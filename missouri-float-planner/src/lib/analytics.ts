// src/lib/analytics.ts
// Website GA4 only. Widgets keep their separate /api/embed/impression beacon.

export const ANALYTICS_OPT_OUT_KEY = 'eddy_analytics_disabled';

type AnalyticsWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  __eddyAnalyticsId?: string;
};

/** NODE_ENV alone also permits next build/start previews. */
export function analyticsTrackingId(env: Record<string, string | undefined>): string | undefined {
  if (env.NODE_ENV !== 'production') return;
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return;
  const id = env.NEXT_PUBLIC_GA_ID || env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  return id && /^G-[A-Z0-9]+$/.test(id) ? id : undefined;
}

function websiteAnalyticsAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (!['eddy.guide', 'www.eddy.guide'].includes(window.location.hostname)) return false;
  // Comparing WindowProxy references is safe even for cross-origin parents.
  if (window.self !== window.top || window.navigator.webdriver) return false;
  try {
    if (window.sessionStorage.getItem(ANALYTICS_OPT_OUT_KEY) === '1') return false;
  } catch {
    // Storage denial must not break the page or exclude ordinary visitors.
  }
  return true;
}

/** Called after hydration. Idempotent across remounts and campaign changes. */
export function initializeAnalytics(trackingId: string | undefined): void {
  if (!trackingId || !/^G-[A-Z0-9]+$/.test(trackingId) || !websiteAnalyticsAllowed()) return;
  const browser = window as AnalyticsWindow;
  if (browser.__eddyAnalyticsId) return;

  browser.dataLayer = browser.dataLayer || [];
  browser.gtag = function () {
    // gtag expects the arguments object, not an array of argument values.
    // eslint-disable-next-line prefer-rest-params
    browser.dataLayer!.push(arguments);
  };
  browser.__eddyAnalyticsId = trackingId;
  browser.gtag('js', new Date());
  // GA owns the initial page view and Enhanced Measurement owns history
  // changes. Do not add a usePathname/manual page_view sender alongside it.
  browser.gtag('config', trackingId);

  const script = document.createElement('script');
  script.id = 'eddy-google-analytics';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
  document.head.appendChild(script);
}

export function trackEvent(action: string, params?: Record<string, unknown>): void {
  if (!websiteAnalyticsAllowed()) return;
  const browser = window as AnalyticsWindow;
  if (!browser.__eddyAnalyticsId || typeof browser.gtag !== 'function') return;
  browser.gtag('event', action, params ?? {});
}
