// src/lib/navigation/deepLinks.ts
// Browser-side navigation behavior (platform detection, deep-link opening).
// The pure URI builders and display formatters moved to @eddy/shared/navigation
// so the mobile app can reuse them.

import type { NavLink, Platform } from '@eddy/shared/navigation';

export {
  type NavigationCoords,
  type NavApp,
  type NavLink,
  type Platform,
  generateNavLinks,
  getNavCoordinates,
  formatRoadSurface,
  getRoadSurfaceBadge,
  formatParkingCapacity,
  getAgencyFullName,
} from '@eddy/shared/navigation';

// ─────────────────────────────────────────────────────────────
// Platform Detection
// ─────────────────────────────────────────────────────────────

/**
 * Detect the current platform based on user agent
 */
export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop';

  const ua = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Check if the current device is mobile (iOS or Android)
 */
export function isMobile(): boolean {
  const platform = detectPlatform();
  return platform === 'ios' || platform === 'android';
}

// ─────────────────────────────────────────────────────────────
// Navigation Click Handler
// ─────────────────────────────────────────────────────────────

/**
 * Handle navigation button click
 * - Desktop: Opens web version in new tab
 * - Mobile: Attempts deep link, falls back to app store after timeout
 *
 * @param navLink - The navigation link configuration
 * @param platform - Current platform (auto-detected if not provided)
 */
export function handleNavClick(navLink: NavLink, platform?: Platform): void {
  const currentPlatform = platform || detectPlatform();

  if (currentPlatform === 'desktop') {
    // Desktop: open web version in new tab
    window.open(navLink.webFallback, '_blank', 'noopener,noreferrer');
    return;
  }

  // Mobile: try deep link, fall back to store
  attemptDeepLink(navLink, currentPlatform);
}

/**
 * Attempt to open a deep link on mobile
 * Falls back to app store if the app isn't installed
 */
function attemptDeepLink(navLink: NavLink, platform: Platform): void {
  // For Google Maps on Android, it's almost always installed - just use intent
  if (navLink.app === 'google' && platform === 'android') {
    // Android Intent for Google Maps (more reliable)
    const intentUrl = navLink.deepLink.replace('comgooglemaps://', 'https://www.google.com/maps/');
    window.location.href = intentUrl;
    return;
  }

  // For Apple Maps on iOS, it's built-in - direct link works
  if (navLink.app === 'apple' && platform === 'ios') {
    window.location.href = navLink.deepLink;
    return;
  }

  // For Onx and Gaia, we need to detect if app is installed
  // Use the visibility API to detect if app opened

  const startTime = Date.now();
  let didOpenApp = false;

  // Create a hidden iframe to attempt the deep link
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = navLink.deepLink;
  document.body.appendChild(iframe);

  // Also try direct location change as backup
  setTimeout(() => {
    if (!didOpenApp) {
      window.location.href = navLink.deepLink;
    }
  }, 100);

  // Set timeout to redirect to store if app doesn't open
  const timeout = setTimeout(() => {
    // If we're still here after 1.5s, app probably isn't installed
    const elapsed = Date.now() - startTime;
    if (elapsed < 2000 && !didOpenApp) {
      const storeUrl = platform === 'ios'
        ? navLink.storeUrl.ios
        : navLink.storeUrl.android;
      window.location.href = storeUrl;
    }
  }, 1500);

  // If page becomes hidden (app opened), clear timeout
  const handleVisibility = () => {
    if (document.hidden) {
      didOpenApp = true;
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', handleVisibility);
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Also listen for blur (iOS sometimes triggers this instead)
  const handleBlur = () => {
    didOpenApp = true;
    clearTimeout(timeout);
    window.removeEventListener('blur', handleBlur);
  };
  window.addEventListener('blur', handleBlur);

  // Cleanup iframe after attempt
  setTimeout(() => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('blur', handleBlur);
  }, 3000);
}
