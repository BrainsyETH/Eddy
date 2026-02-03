// src/lib/navigation/deepLinks.ts
// Deep link generation for navigation apps (Onx, Gaia, Google Maps, Apple Maps)

export interface NavigationCoords {
  lat: number;
  lng: number;
  label?: string;
}

export type NavApp = 'onx' | 'gaia' | 'google' | 'apple';

export interface NavLink {
  app: NavApp;
  label: string;
  subtitle: string;
  icon: string;
  deepLink: string;      // App deep link (mobile)
  webFallback: string;   // Web URL (desktop)
  storeUrl: {
    ios: string;
    android: string;
  };
}

/**
 * Generate navigation links for all supported apps
 *
 * @param coords - Latitude, longitude, and optional label for the location
 * @param directionsOverride - Optional Google Maps URL that overrides coordinate-based link
 * @returns Array of NavLink objects for each supported app
 */
export function generateNavLinks(
  coords: NavigationCoords,
  directionsOverride?: string | null
): NavLink[] {
  const { lat, lng, label } = coords;
  const encodedLabel = encodeURIComponent(label || 'Access Point');

  return [
    {
      app: 'onx',
      label: 'Onx',
      subtitle: 'Offroad',
      icon: '🧭',
      deepLink: `onxoffroad://map?lat=${lat}&lon=${lng}&zoom=15`,
      webFallback: `https://webmap.onxmaps.com/?lat=${lat}&lon=${lng}&zoom=15`,
      storeUrl: {
        ios: 'https://apps.apple.com/app/onx-offroad/id1326549302',
        android: 'https://play.google.com/store/apps/details?id=com.onxmaps.offroad',
      },
    },
    {
      app: 'gaia',
      label: 'Gaia',
      subtitle: 'GPS',
      icon: '🗺️',
      deepLink: `gaiagps://map?lat=${lat}&lon=${lng}&zoom=15`,
      webFallback: `https://www.gaiagps.com/map/?lat=${lat}&lon=${lng}&zoom=15`,
      storeUrl: {
        ios: 'https://apps.apple.com/app/gaia-gps-offroad-hiking-maps/id329127297',
        android: 'https://play.google.com/store/apps/details?id=com.trailbehind.android.gaiagps.pro',
      },
    },
    {
      app: 'google',
      label: 'Google',
      subtitle: 'Maps',
      icon: '📍',
      // Use directionsOverride if provided, otherwise generate from coordinates
      deepLink: directionsOverride || `comgooglemaps://?q=${lat},${lng}&label=${encodedLabel}`,
      webFallback: directionsOverride || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      storeUrl: {
        ios: 'https://apps.apple.com/app/google-maps/id585027354',
        android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps',
      },
    },
    {
      app: 'apple',
      label: 'Apple',
      subtitle: 'Maps',
      icon: '🍎',
      deepLink: `maps://?q=${encodedLabel}&ll=${lat},${lng}`,
      webFallback: `https://maps.apple.com/?q=${encodedLabel}&ll=${lat},${lng}`,
      storeUrl: {
        // Apple Maps is built-in on iOS, but link to it anyway
        ios: 'https://apps.apple.com/app/apple-maps/id915056765',
        // Android doesn't have Apple Maps, fallback to Google
        android: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      },
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// Platform Detection
// ─────────────────────────────────────────────────────────────

export type Platform = 'ios' | 'android' | 'desktop';

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

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

/**
 * Get coordinates for navigation from access point data
 * Prefers driving coordinates if available, falls back to location
 */
export function getNavCoordinates(accessPoint: {
  drivingLat?: number | null;
  drivingLng?: number | null;
  coordinates: { lat: number; lng: number };
  name: string;
}): NavigationCoords {
  // Prefer driving coordinates if available
  if (accessPoint.drivingLat && accessPoint.drivingLng) {
    return {
      lat: accessPoint.drivingLat,
      lng: accessPoint.drivingLng,
      label: accessPoint.name,
    };
  }

  // Fall back to access point coordinates
  return {
    lat: accessPoint.coordinates.lat,
    lng: accessPoint.coordinates.lng,
    label: accessPoint.name,
  };
}

/**
 * Format road surface types for display
 */
export function formatRoadSurface(surfaces: string[]): string {
  if (!surfaces || surfaces.length === 0) return 'Unknown';

  const labels: Record<string, string> = {
    'paved': 'Paved',
    'gravel_maintained': 'Gravel (maintained)',
    'gravel_unmaintained': 'Gravel (unmaintained)',
    'dirt': 'Dirt',
    'seasonal': 'Seasonal',
    '4wd_required': '4WD Required',
  };

  return surfaces.map(s => labels[s] || s).join(' → ');
}

/**
 * Get the primary road surface for badge display
 */
export function getRoadSurfaceBadge(surfaces: string[]): string | null {
  if (!surfaces || surfaces.length === 0) return null;

  // Priority order for badge display (show the most restrictive)
  const priority = [
    '4wd_required',
    'seasonal',
    'dirt',
    'gravel_unmaintained',
    'gravel_maintained',
    'paved',
  ];

  for (const surface of priority) {
    if (surfaces.includes(surface)) {
      const badges: Record<string, string> = {
        '4wd_required': '4WD',
        'seasonal': 'SEASONAL',
        'dirt': 'DIRT',
        'gravel_unmaintained': 'GRAVEL',
        'gravel_maintained': 'GRAVEL',
        'paved': 'PAVED',
      };
      return badges[surface] || surface.toUpperCase();
    }
  }

  return null;
}

/**
 * Format parking capacity for display
 */
export function formatParkingCapacity(capacity: string | null): string {
  if (!capacity) return 'Unknown';

  const labels: Record<string, string> = {
    '5': '~5 vehicles',
    '10': '~10 vehicles',
    '15': '~15 vehicles',
    '20': '~20 vehicles',
    '25': '~25 vehicles',
    '30': '~30 vehicles',
    '50+': '50+ vehicles',
    'roadside': 'Roadside only',
    'limited': 'Limited',
    'unknown': 'Unknown',
  };

  return labels[capacity] || capacity;
}

/**
 * Get the full name for a managing agency
 */
export function getAgencyFullName(agency: string | null): string {
  if (!agency) return 'Unknown';

  const names: Record<string, string> = {
    'MDC': 'Missouri Dept. of Conservation',
    'NPS': 'National Park Service',
    'USFS': 'U.S. Forest Service',
    'COE': 'U.S. Army Corps of Engineers',
    'State Park': 'Missouri State Parks',
    'County': 'County',
    'Municipal': 'Municipal',
    'Private': 'Private',
  };

  return names[agency] || agency;
}
