// src/lib/navigation/index.ts
// Navigation utilities for access point detail pages

export {
  // Types
  type NavigationCoords,
  type NavApp,
  type NavLink,
  type Platform,
  // Functions
  generateNavLinks,
  detectPlatform,
  isMobile,
  handleNavClick,
  getNavCoordinates,
  formatRoadSurface,
  getRoadSurfaceBadge,
  formatParkingCapacity,
  getAgencyFullName,
} from './deepLinks';
