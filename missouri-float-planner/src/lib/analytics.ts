// src/lib/analytics.ts
// Website GA4 only. Widgets keep their separate /api/embed/impression beacon.

export const ANALYTICS_OPT_OUT_KEY = 'eddy_analytics_disabled';

type AnalyticsWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  __eddyAnalyticsId?: string;
  __eddyPageView?: { pathname: string; location: string };
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
  // Eddy owns page views. Also disable GA4's browser-history page views in
  // Enhanced Measurement before rollout; send_page_view alone does not do it.
  browser.gtag('config', trackingId, { send_page_view: false });

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

/** One view per visible pathname, including return visits via Back/Forward.
 * Query/hash changes are state within a page, not additional page views.
 * Window state survives listener remounts without leaking across SSR requests.
 */
export function trackPageView(): void {
  if (!websiteAnalyticsAllowed()) return;
  const browser = window as AnalyticsWindow;
  if (!browser.__eddyAnalyticsId || typeof browser.gtag !== 'function') return;
  const pathname = browser.location.pathname;
  const previous = browser.__eddyPageView;
  if (previous?.pathname === pathname) return;
  const location = browser.location.href;
  trackEvent('page_view', {
    page_path: pathname,
    page_location: location,
    page_title: document.title,
    page_referrer: previous?.location ?? document.referrer,
  });
  browser.__eddyPageView = { pathname, location };
}

/** Shared menus opt in once; explicit CTA events keep their existing names. */
export function trackNavigationClick(target: Element | null): void {
  if (!websiteAnalyticsAllowed() || target?.closest?.('[data-ga-event]')) return;
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  const placement = anchor?.closest<HTMLElement>('[data-ga-navigation]')?.dataset.gaNavigation;
  if (!anchor || !placement) return;
  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return;
  trackEvent('navigation_click', {
    label: (anchor.getAttribute('aria-label') || anchor.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
    placement,
    destination_path: destination.pathname,
    page_path: window.location.pathname,
  });
}
