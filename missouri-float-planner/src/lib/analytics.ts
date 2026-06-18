// src/lib/analytics.ts
// Thin wrapper around the GA4 gtag global. No-ops when GA isn't configured
// (window.gtag is only defined when NEXT_PUBLIC_GA_ID is set — see layout.tsx).

export function trackEvent(action: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== 'function') return;
  gtag('event', action, params ?? {});
}
