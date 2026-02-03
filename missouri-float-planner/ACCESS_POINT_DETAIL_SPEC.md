# Access Point Detail Page - Implementation Spec

> **Version:** 1.0
> **Date:** February 2026
> **Status:** Planning

---

## Overview

Transform access points from simple map pins into rich detail pages with navigation integration, facility information, and curated local knowledge. The goal is to be the hub that connects all scattered pieces of the float planning ecosystem.

### Key Features
- Deep links to Onx Offroad, Gaia GPS, Google Maps, Apple Maps
- Collapsible sections optimized for mobile
- Managing agency badges with links to official federal/state pages
- Curated Eddy tips (🦦) for local knowledge
- Admin editor for easy content management

---

## 1. Route Structure

```
/rivers/[riverSlug]/access/[accessSlug]
```

**Examples:**
- `/rivers/huzzah-creek/access/davisville-access`
- `/rivers/current-river/access/pulltite-spring`
- `/rivers/meramec-river/access/scotts-ford`

**Breadcrumb:** Rivers → Huzzah Creek → Davisville Access

---

## 2. Database Schema Changes

### 2.1 New Fields for `access_points` Table

```sql
-- Migration: add_access_point_detail_fields

ALTER TABLE public.access_points

-- Road information (structured + free text)
ADD COLUMN road_surface text[] DEFAULT '{}'::text[],
-- Values: 'paved', 'gravel_maintained', 'gravel_unmaintained', 'dirt', 'seasonal', '4wd_required'

-- Parking (structured for quick stats)
ADD COLUMN parking_capacity text,
-- Values: '5', '10', '15', '20', '25', '50+', 'roadside', 'limited'

-- Managing agency for facilities badge
ADD COLUMN managing_agency text,
-- Values: 'MDC', 'NPS', 'USFS', 'COE', 'State Park', 'County', 'Municipal', 'Private'

-- Official site deep link (specific page, not homepage)
ADD COLUMN official_site_url text,

-- Curated local knowledge (rich text HTML from TipTap)
ADD COLUMN local_tips text,

-- Nearby outfitters/campgrounds (JSONB array)
ADD COLUMN nearby_services jsonb DEFAULT '[]'::jsonb;

-- Add comment for nearby_services structure
COMMENT ON COLUMN public.access_points.nearby_services IS
'Array of nearby services: [{"name": "string", "type": "outfitter|campground|canoe_rental", "phone": "string", "website": "string", "distance": "string", "notes": "string"}]';
```

### 2.2 Field Constraints

```sql
-- Road surface constraint
ALTER TABLE public.access_points
ADD CONSTRAINT access_points_road_surface_check
CHECK (
  road_surface <@ ARRAY['paved', 'gravel_maintained', 'gravel_unmaintained', 'dirt', 'seasonal', '4wd_required']::text[]
);

-- Managing agency constraint
ALTER TABLE public.access_points
ADD CONSTRAINT access_points_managing_agency_check
CHECK (
  managing_agency IS NULL OR
  managing_agency = ANY(ARRAY['MDC', 'NPS', 'USFS', 'COE', 'State Park', 'County', 'Municipal', 'Private'])
);

-- Parking capacity constraint
ALTER TABLE public.access_points
ADD CONSTRAINT access_points_parking_capacity_check
CHECK (
  parking_capacity IS NULL OR
  parking_capacity = ANY(ARRAY['5', '10', '15', '20', '25', '30', '50+', 'roadside', 'limited', 'unknown'])
);
```

### 2.3 Existing Fields (No Changes Needed)

These fields already exist and will be used:

| Field | Type | Purpose |
|-------|------|---------|
| `road_access` | text | Free-text road details ("Last 2 mi unmaintained, cattle gate at turn-off") |
| `parking_info` | text | Detailed parking notes |
| `facilities` | text | Facility details (restrooms, camping, water) |
| `driving_lat`, `driving_lng` | numeric | Navigation coordinates |
| `directions_override` | text | Alternative Google Maps URL (overrides coordinate-based link) |
| `google_maps_url` | text | Legacy field, will use `directions_override` instead |
| `types` | text[] | Access point usage types ('put_in', 'take_out', 'campground', etc.) |
| `image_urls` | text[] | Photos of access point |

---

## 3. TypeScript Types

### 3.1 API Types (`src/types/api.ts`)

```typescript
// Road surface options
export type RoadSurface =
  | 'paved'
  | 'gravel_maintained'
  | 'gravel_unmaintained'
  | 'dirt'
  | 'seasonal'
  | '4wd_required';

// Managing agency options
export type ManagingAgency =
  | 'MDC'
  | 'NPS'
  | 'USFS'
  | 'COE'
  | 'State Park'
  | 'County'
  | 'Municipal'
  | 'Private';

// Parking capacity options
export type ParkingCapacity =
  | '5' | '10' | '15' | '20' | '25' | '30' | '50+'
  | 'roadside' | 'limited' | 'unknown';

// Nearby service (outfitter, campground, etc.)
export interface NearbyService {
  name: string;
  type: 'outfitter' | 'campground' | 'canoe_rental' | 'shuttle' | 'lodging';
  phone?: string;
  website?: string;
  distance?: string;  // "2 mi", "0.5 mi"
  notes?: string;     // "Weekends only after Labor Day"
}

// Extended access point for detail page
export interface AccessPointDetail extends AccessPoint {
  // New fields
  roadSurface: RoadSurface[];
  parkingCapacity: ParkingCapacity | null;
  managingAgency: ManagingAgency | null;
  officialSiteUrl: string | null;
  localTips: string | null;  // HTML from TipTap
  nearbyServices: NearbyService[];

  // Navigation
  directionsOverride: string | null;  // Alternative Google Maps URL

  // Related data (fetched separately or joined)
  river: {
    name: string;
    slug: string;
  };
  nearbyAccessPoints: NearbyAccessPoint[];
  gaugeStatus: GaugeStatus | null;
}

// Simplified access point for "nearby" list
export interface NearbyAccessPoint {
  id: string;
  name: string;
  slug: string;
  direction: 'upstream' | 'downstream';
  distanceMiles: number;
  estimatedFloatTime: string;  // "~1.5 hr"
}

// Gauge status for the access point
export interface GaugeStatus {
  level: 'too_low' | 'low' | 'optimal' | 'high' | 'flood' | 'unknown';
  cfs: number | null;
  label: string;  // "Optimal for floating"
  trend: 'rising' | 'falling' | 'steady' | null;
  lastUpdated: string;  // ISO timestamp
  gaugeId: string;
  gaugeName: string;
}
```

### 3.2 Admin Types

```typescript
// Form state for admin editor
export interface AccessPointFormData {
  // Existing fields
  name: string;
  slug: string;
  types: string[];
  description: string;
  isPublic: boolean;
  ownership: string;
  feeRequired: boolean;
  feeNotes: string;

  // Road
  roadSurface: RoadSurface[];
  roadAccess: string;

  // Parking
  parkingCapacity: ParkingCapacity | null;
  parkingInfo: string;

  // Facilities
  facilities: string;
  managingAgency: ManagingAgency | null;
  officialSiteUrl: string;

  // Navigation
  drivingLat: number | null;
  drivingLng: number | null;
  directionsOverride: string;

  // Content
  localTips: string;
  nearbyServices: NearbyService[];
  imageUrls: string[];
}
```

---

## 4. Component Architecture

### 4.1 File Structure

```
src/
├── app/
│   └── rivers/
│       └── [slug]/
│           └── access/
│               └── [accessSlug]/
│                   └── page.tsx          # Detail page (server component)
│
├── components/
│   └── access-point/
│       ├── AccessPointDetail.tsx         # Main detail component
│       ├── AccessPointHeader.tsx         # Hero + quick stats
│       ├── AccessPointNav.tsx            # Navigation buttons (Onx, Gaia, etc.)
│       ├── AccessPointSection.tsx        # Collapsible section wrapper
│       ├── AccessPointGauge.tsx          # Water level status
│       ├── NearbyAccessPoints.tsx        # Upstream/downstream links
│       ├── EddyTip.tsx                   # 🦦 local knowledge callout
│       └── sections/
│           ├── RoadAccessSection.tsx
│           ├── ParkingSection.tsx
│           ├── FacilitiesSection.tsx
│           ├── OutfittersSection.tsx
│           └── RiverNotesSection.tsx
│
├── hooks/
│   └── useAccessPointDetail.ts           # React Query hook for detail data
│
└── lib/
    └── navigation/
        └── deepLinks.ts                  # Nav app URL generators
```

### 4.2 Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Huzzah Creek                    [Share] [Copy]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ░░░░░░░░░░░░░░░ HERO IMAGE ░░░░░░░░░░░░░░░░░░░░░░  │   │
│  │                                                      │   │
│  │  DAVISVILLE ACCESS                                   │   │
│  │  River mile 8.2 · Crawford County                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────┬───────────┬───────────┐                     │
│  │  Use as   │  Parking  │   Road    │  ← Quick Stats      │
│  │ Put-in/   │    ~15    │  Gravel   │    (always visible) │
│  │ Take-out  │ vehicles  │           │                     │
│  └───────────┴───────────┴───────────┘                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ▓▓▓ OPTIMAL FOR FLOATING          285 cfs  →steady │   │  ← Gauge
│  │  USGS 07013000 · Updated 18 min ago                 │   │    (always visible)
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────┬─────────┬─────────┬─────────┐                 │
│  │   🧭    │   🗺️    │   📍    │   🍎    │  ← Nav Buttons  │
│  │   Onx   │  Gaia   │ Google  │  Apple  │    (deep links) │
│  │ Offroad │   GPS   │  Maps   │  Maps   │                 │
│  └─────────┴─────────┴─────────┴─────────┘                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🚗 Road Access                          [GRAVEL] ▾  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 🅿️ Parking                                        ▾  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 🏕️ Facilities                              [MDC] ▾  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 🛶 Outfitters                                     ▾  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 📝 River Notes                                    ▾  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NEARBY ON HUZZAH CREEK                             │   │
│  │  ↑ Huzzah Conservation Access  3.2 mi · ~1.5 hr  ›  │   │
│  │  ↓ Scotts Ford                 4.8 mi · ~2.5 hr  ›  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Navigation Deep Links

### 5.1 URL Schemes

```typescript
// src/lib/navigation/deepLinks.ts

export interface NavigationCoords {
  lat: number;
  lng: number;
  label?: string;
}

export type NavApp = 'onx' | 'gaia' | 'google' | 'apple';

interface NavLink {
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
      // Use directionsOverride if provided
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
        ios: 'https://apps.apple.com/app/apple-maps/id915056765',
        android: 'https://www.google.com/maps/search/?api=1&query=${lat},${lng}', // Fallback to Google on Android
      },
    },
  ];
}
```

### 5.2 Platform Detection & Button Behavior

```typescript
// src/lib/navigation/platform.ts

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop';

  const ua = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

export function handleNavClick(navLink: NavLink, platform: Platform): void {
  if (platform === 'desktop') {
    // Desktop: open web version in new tab
    window.open(navLink.webFallback, '_blank');
    return;
  }

  // Mobile: try deep link, fall back to store
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = navLink.deepLink;
  document.body.appendChild(iframe);

  // Set timeout to redirect to store if app doesn't open
  const timeout = setTimeout(() => {
    const storeUrl = platform === 'ios'
      ? navLink.storeUrl.ios
      : navLink.storeUrl.android;
    window.location.href = storeUrl;
  }, 1500);

  // If page becomes hidden (app opened), clear timeout
  const handleVisibility = () => {
    if (document.hidden) {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', handleVisibility);
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Cleanup iframe
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 2000);
}
```

---

## 6. Admin Editor

### 6.1 Route

Extend existing admin: `/admin/access-points/[id]`

### 6.2 Editor Layout

The editor should mirror the public detail page structure for intuitive editing:

```
┌─────────────────────────────────────────────────────────────┐
│  EDIT ACCESS POINT                           [Save] [Cancel]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─── BASIC INFO ─────────────────────────────────────────┐ │
│  │ Name: [Davisville Access________________]              │ │
│  │ Slug: [davisville-access_________________]             │ │
│  │ Types: [x] Put-in [x] Take-out [ ] Campground         │ │
│  │ Public: [x] Yes                                        │ │
│  │ Fee Required: [ ]                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── IMAGES ─────────────────────────────────────────────┐ │
│  │ [img1] [img2] [+Add]                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── 🚗 ROAD ACCESS ─────────────────────────────────────┐ │
│  │ Surface: [x] Gravel (maintained)  [ ] Paved           │ │
│  │          [ ] Gravel (unmaintained) [ ] Dirt           │ │
│  │          [ ] Seasonal  [ ] 4WD Required               │ │
│  │                                                        │ │
│  │ Details:                                               │ │
│  │ ┌──────────────────────────────────────────────────┐  │ │
│  │ │ Last 2 mi is unmaintained gravel. Cattle gate   │  │ │
│  │ │ at the turn-off - close it behind you.          │  │ │
│  │ └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── 🅿️ PARKING ──────────────────────────────────────────┐ │
│  │ Capacity: [15 vehicles ▾]                              │ │
│  │                                                        │ │
│  │ Details:                                               │ │
│  │ ┌──────────────────────────────────────────────────┐  │ │
│  │ │ Gravel lot with turnaround loop. Fills by 9:30am│  │ │
│  │ │ on summer Saturdays.                             │  │ │
│  │ └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── 🏕️ FACILITIES ───────────────────────────────────────┐ │
│  │ Managing Agency: [MDC ▾]                               │ │
│  │ Official Site URL: [https://mdc.mo.gov/davisville___] │ │
│  │                                                        │ │
│  │ Details:                                               │ │
│  │ ┌──────────────────────────────────────────────────┐  │ │
│  │ │ Vault toilet (seasonal). Primitive camping, no  │  │ │
│  │ │ fee. No water - pack in.                         │  │ │
│  │ └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── 📍 NAVIGATION ───────────────────────────────────────┐ │
│  │ Driving Coordinates:                                   │ │
│  │   Lat: [37.9847____]  Lng: [-91.1234___]              │ │
│  │                                                        │ │
│  │ Directions Override (optional):                        │ │
│  │ [https://maps.google.com/?q=...___________________]   │ │
│  │ ℹ️ Overrides Google Maps link if coordinates are wrong │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── 🛶 OUTFITTERS ───────────────────────────────────────┐ │
│  │ ┌──────────────────────────────────────────────────┐  │ │
│  │ │ Name: [Ozark Outdoors__________]                 │  │ │
│  │ │ Type: [Outfitter ▾]  Phone: [(573) 245-6514]    │  │ │
│  │ │ Website: [https://ozarkoutdoors.com]            │  │ │
│  │ │ Distance: [2 mi]                                 │  │ │
│  │ │ Notes: [Runs shuttles daily May-Sept]           │  │ │
│  │ │                                    [✕ Remove]   │  │ │
│  │ └──────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  │ [+ Add Outfitter/Campground]                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── 📝 RIVER NOTES (Eddy Tips 🦦) ───────────────────────┐ │
│  │ ┌──────────────────────────────────────────────────┐  │ │
│  │ │ [TipTap Rich Text Editor]                        │  │ │
│  │ │                                                   │  │ │
│  │ │ After rain, the last half mile can get muddy.   │  │ │
│  │ │ 4WD recommended within 24hrs of heavy rain.     │  │ │
│  │ │                                                   │  │ │
│  │ │ Cell service is spotty here - download maps     │  │ │
│  │ │ before leaving Steelville.                       │  │ │
│  │ └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│                                      [Save Changes] [Cancel]│
└─────────────────────────────────────────────────────────────┘
```

### 6.3 TipTap Configuration

For rich text fields, use a minimal TipTap configuration:

```typescript
// Allowed formatting for admin rich text
const extensions = [
  StarterKit.configure({
    heading: false,      // No headings
    codeBlock: false,    // No code blocks
  }),
  Link.configure({
    openOnClick: false,
  }),
];

// Toolbar: Bold, Italic, Link, Bullet List, Numbered List
```

---

## 7. API Endpoints

### 7.1 GET Access Point Detail

```
GET /api/rivers/[riverSlug]/access/[accessSlug]
```

**Response:**
```typescript
interface AccessPointDetailResponse {
  accessPoint: AccessPointDetail;
  river: {
    id: string;
    name: string;
    slug: string;
  };
  nearbyAccessPoints: NearbyAccessPoint[];
  gaugeStatus: GaugeStatus | null;
}
```

### 7.2 Admin Update

```
PUT /api/admin/access-points/[id]
```

**Request Body:** `AccessPointFormData`

---

## 8. Responsive Design

### 8.1 Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | < 640px | Single column, all sections collapsed, 44px touch targets |
| Tablet | 640-1024px | Same as mobile but more padding |
| Desktop | > 1024px | Centered card (max-width 560px), generous whitespace |

### 8.2 Mobile Optimizations

- **Touch targets:** Minimum 44px height for all interactive elements
- **Sections:** All collapsed by default
- **Nav buttons:** Full width, stacked 2x2 grid
- **Share button:** Native share API on mobile, copy-to-clipboard on desktop
- **Back navigation:** Sticky header with "← Back to [River]"

### 8.3 Desktop Optimizations

- **Max-width:** 560px for content card
- **Whitespace:** Generous padding on sides
- **Hover states:** Nav buttons show border highlight on hover
- **Share:** Copy URL to clipboard with toast notification

---

## 9. Implementation Phases

### Phase 1: Schema & Types (Day 1)
- [ ] Run database migration
- [ ] Update TypeScript types in `src/types/api.ts`
- [ ] Update database types in `src/types/database.ts`

### Phase 2: API Endpoints (Day 1-2)
- [ ] Create `GET /api/rivers/[riverSlug]/access/[accessSlug]/route.ts`
- [ ] Update admin endpoint for new fields
- [ ] Add React Query hook `useAccessPointDetail`

### Phase 3: Detail Page Components (Day 2-4)
- [ ] Create page route `src/app/rivers/[slug]/access/[accessSlug]/page.tsx`
- [ ] Build `AccessPointDetail` main component
- [ ] Build `AccessPointHeader` (hero + quick stats)
- [ ] Build `AccessPointNav` (navigation buttons)
- [ ] Build `AccessPointSection` (collapsible wrapper)
- [ ] Build individual section components
- [ ] Build `NearbyAccessPoints` component
- [ ] Implement deep link logic

### Phase 4: Admin Editor (Day 4-5)
- [ ] Extend `/admin/access-points` with detail editor
- [ ] Build form components for each section
- [ ] Add TipTap integration for `local_tips`
- [ ] Build `NearbyServices` array editor
- [ ] Add save/validation logic

### Phase 5: Polish & Testing (Day 5-6)
- [ ] Mobile responsive testing
- [ ] Deep link testing on iOS/Android
- [ ] Share functionality
- [ ] Performance optimization
- [ ] Accessibility audit (keyboard nav, screen readers)

---

## 10. Open Items for Future

- [ ] Community-contributed "Floater Notes" (user submissions)
- [ ] Photo upload from detail page
- [ ] Offline caching for downloaded access points
- [ ] Favorite/bookmark access points
- [ ] Print-friendly view for trip planning

---

## 11. Acceptance Criteria

### Detail Page
- [ ] Loads access point data from Supabase
- [ ] Shows hero image (or placeholder gradient)
- [ ] Shows quick stats bar (use type, parking, road)
- [ ] Shows gauge status with correct color coding
- [ ] Nav buttons open correct app or redirect to store
- [ ] All sections collapse/expand smoothly
- [ ] Shows managing agency badge on Facilities
- [ ] Links to official site work correctly
- [ ] Shows Eddy tips (🦦) with rich text formatting
- [ ] Shows nearby access points with float time estimates
- [ ] Share button works on mobile and desktop
- [ ] Back navigation returns to river page

### Admin Editor
- [ ] All fields editable with appropriate input types
- [ ] Multi-select for road surface
- [ ] JSONB array editor for nearby services
- [ ] TipTap editor for local tips
- [ ] Save persists to database
- [ ] Validation prevents invalid data
- [ ] Success/error toasts on save

### Mobile
- [ ] All touch targets ≥ 44px
- [ ] Sections collapsed by default
- [ ] Deep links attempt app, fall back to store
- [ ] Native share API works

### Desktop
- [ ] Content centered with max-width
- [ ] Hover states on interactive elements
- [ ] Copy-to-clipboard for share
