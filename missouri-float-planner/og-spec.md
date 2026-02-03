# eddy.guide — Open Graph Image Spec

## Overview

Revamp all social preview cards (OG images) across eddy.guide. These cards appear when any eddy.guide URL is shared on Facebook, Twitter/X, iMessage, Discord, Slack, LinkedIn, etc.

**Target:** 1200×630px PNG images generated dynamically at the edge using Next.js `ImageResponse` (from `next/og` / Satori).

**Design Priority:** Readability at a glance. Users will be viewing these as thumbnails when shared. Key information must be legible even at 120×63px.

**Page types requiring unique OG cards:**
1. Homepage (`/`)
2. River pages (`/rivers/[slug]`)
3. Access point pages (`/rivers/[slug]/[accessPointSlug]`)
4. Gauge station pages (`/gauges/[stationId]`)
5. Float plan pages (`/plan` - shared trips)

---

## Brand System (Reference)

### Colors

```ts
const COLORS = {
  // Brand core
  adventureNight: '#161748',   // Primary dark — all card backgrounds
  greenTreeline: '#478559',    // Eddy branding, nature accent
  bluewater: '#39a0ca',        // Links, water elements, info accent
  accentCoral: '#F07052',      // CTAs, highlights

  // Extended palette
  deepWater: '#0B2545',
  riverBlue: '#1B4965',
  skyBlue: '#62B6CB',
  mossGreen: '#81B29A',
  shallowBlue: '#BEE9E8',
  sandbar: '#F4F1DE',

  // Status colors (matches src/constants/index.ts)
  statusTooLow: '#9ca3af',     // gray
  statusVeryLow: '#eab308',    // yellow
  statusLow: '#84cc16',        // lime (okay)
  statusOptimal: '#059669',    // emerald
  statusHigh: '#f97316',       // orange
  statusDangerous: '#ef4444',  // red
  statusUnknown: '#9ca3af',    // gray
} as const;
```

### Typography

- **Headings/Display:** Space Grotesk (Bold 700, SemiBold 600)
- **Body/Secondary:** Inter (Regular 400, Medium 500)
- Both fonts must be loaded as ArrayBuffers for Satori rendering

### Eddy Mascot Image

For OG images, use `Eddy_favicon.png` (smaller, works better at small sizes):
```
https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png
```

---

## Status System

**IMPORTANT:** Use the actual condition codes from the codebase, not custom ones.

```ts
type ConditionCode = 'dangerous' | 'high' | 'optimal' | 'low' | 'very_low' | 'too_low' | 'unknown';
```

### Status Display Mapping

| Code | Short Label | Full Label | Color |
|------|-------------|------------|-------|
| `too_low` | "Too Low" | "Too Low - Not Recommended" | `#9ca3af` |
| `very_low` | "Low" | "Low - Scraping Likely" | `#eab308` |
| `low` | "Okay" | "Okay - Floatable" | `#84cc16` |
| `optimal` | "Optimal" | "Optimal Conditions" | `#059669` |
| `high` | "High" | "High Water - Experienced Only" | `#f97316` |
| `dangerous` | "Flood" | "Flood - Do Not Float" | `#ef4444` |
| `unknown` | "N/A" | "Unknown" | `#9ca3af` |

### Status Badge Styles

```ts
export function getStatusStyles(status: ConditionCode) {
  const styles: Record<ConditionCode, { solid: string; text: string; bg: string; border: string; label: string }> = {
    too_low:   { solid: '#9ca3af', text: '#9ca3af', bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.3)', label: 'Too Low' },
    very_low:  { solid: '#eab308', text: '#eab308', bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.3)',   label: 'Low' },
    low:       { solid: '#84cc16', text: '#84cc16', bg: 'rgba(132,204,22,0.15)',  border: 'rgba(132,204,22,0.3)',  label: 'Okay' },
    optimal:   { solid: '#059669', text: '#059669', bg: 'rgba(5,150,105,0.2)',    border: 'rgba(5,150,105,0.35)',  label: 'Optimal' },
    high:      { solid: '#f97316', text: '#f97316', bg: 'rgba(249,115,22,0.2)',   border: 'rgba(249,115,22,0.3)',  label: 'High' },
    dangerous: { solid: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.25)',  label: 'Flood' },
    unknown:   { solid: '#9ca3af', text: '#9ca3af', bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.3)', label: 'N/A' },
  };
  return styles[status];
}
```

---

## Data Handling Rules

### Truncation
- **River names:** Truncate at ~20 characters with ellipsis (e.g., "Big Piney River..." or "North Fork...")
- **Access point names:** Truncate at ~25 characters
- **Station names:** Allow 2 lines max, truncate if longer

### Missing Data
- **Missing gauge reading:** Show "N/A"
- **Missing status:** Show gray "N/A" badge
- **No access points:** Show "0"
- **No associated rivers:** Show "No linked rivers"
- **Any empty field:** Omit the field entirely rather than showing empty

---

## Tagline

Use consistently across all cards:
- **Primary:** `Plan your float trip with Eddy`

---

## Card 1: Homepage

**Route:** `src/app/opengraph-image.tsx`
**Also create:** `src/app/twitter-image.tsx` (same design)

### Layout

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  [Eddy Avatar 72px circle]                               │
│                                                          │
│  Plan your float trip                                    │
│  with Eddy              ← "with Eddy" in #39a0ca        │
│                                                          │
│  Missouri's Ozark rivers — live gauges,                  │
│  access points, and trip planning                        │
│                                                          │
│  [Live USGS Data] [30+ Access Points] [Float Times]     │
│                                                          │
│  ~~~~~~~~~~~~ wave lines ~~~~~~~~~~~~    eddy.guide      │
└──────────────────────────────────────────────────────────┘
```

### Design Specifics

- **Background:** Linear gradient from `#161748` (left) to `#1a1f5c` (mid) to `#1B4965` (right), direction 135deg
- **Eddy avatar:** 72px circle with gradient background (`#478559` → `#81B29A`), 3px border `rgba(255,255,255,0.2)`, contains the Eddy favicon PNG
- **Title:** Space Grotesk 42px Bold, white. "with Eddy" portion colored `#39a0ca`
- **Tagline:** Inter 18px, `rgba(255,255,255,0.7)`
- **Pill badges:** 3 pills in a row with 8px gap
  - "Live USGS Data" — blue: `rgba(57,160,202,0.2)` bg, `#39a0ca` text, 1px border `rgba(57,160,202,0.3)`
  - "30+ Access Points" — green: `rgba(71,133,89,0.2)` bg, `#81B29A` text, 1px border `rgba(71,133,89,0.3)`
  - "Float Times" — coral: `rgba(240,112,82,0.15)` bg, `#F07052` text, 1px border `rgba(240,112,82,0.25)`
  - Font: Space Grotesk 12px SemiBold, border-radius 100px, padding 6px 14px
- **Wave lines:** 3 horizontal lines near bottom, using linear gradients from transparent → `rgba(57,160,202,0.4)` → transparent
- **Domain watermark:** "eddy.guide" bottom-right, Space Grotesk 14px SemiBold, `rgba(255,255,255,0.5)`
- **Padding:** 48px all sides

### Metadata

```ts
export const alt = 'Plan your float trip with Eddy — Missouri Ozark river trip planner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
```

---

## Card 2: River Page

**Route:** `src/app/rivers/[slug]/opengraph-image.tsx`

### Layout (Simplified for thumbnail legibility)

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  [🦦] eddy.guide                                         │
│                                                          │
│  Huzzah Creek                    ← Large, primary focus  │
│                                                          │
│  ACCESS POINTS     GAUGE LEVEL                           │
│  8                 3.2 ft                                │
│                                                          │
│  [████ Optimal ████]             ← Large status badge   │
│                                                          │
│                          Plan your float trip with Eddy  │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 4px status bar │
└──────────────────────────────────────────────────────────┘
```

### Design Specifics

**Full-width card (no right panel)** — prioritizes river name visibility at thumbnail size.

- **Background:** Same gradient as homepage
- **Padding:** 40px all sides

**Elements:**

1. **Eddy brand mark:** 28px green gradient circle + "eddy.guide" in Space Grotesk 13px SemiBold, `rgba(255,255,255,0.5)`. Margin-bottom 20px.

2. **River name:** Space Grotesk 48px Bold, white, letter-spacing -0.5px. Truncate if > 20 chars. Margin-bottom 24px.

3. **Metadata row:** 2 items with 32px gap
   - Label: Inter 11px SemiBold uppercase, `rgba(255,255,255,0.5)`, letter-spacing 1px
   - Value: Space Grotesk 20px Bold, white
   - Items: Access Points count, Gauge Level (reading + unit)

4. **Status badge:** Large variant for visibility
   - Space Grotesk 16px Bold
   - Padding 10px 20px, border-radius 100px
   - 10px status dot + text
   - Uses status color for bg/border/text

5. **Bottom accent bar:** 4px height, full width, gradient using status colors

6. **Tagline:** "Plan your float trip with Eddy", bottom-right, Space Grotesk 12px Medium, `rgba(255,255,255,0.4)`

### Dynamic Data

```ts
interface RiverOGData {
  name: string;              // "Huzzah Creek"
  accessPointCount: number;  // 8
  gaugeReading: number | null;      // 3.2
  gaugeUnit: string;         // "ft"
  gaugeStatus: ConditionCode;  // "optimal"
}
```

### Metadata

```ts
export const alt = `${river.name} — Current river conditions on eddy.guide`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
```

---

## Card 3: Access Point

**Route:** `src/app/rivers/[slug]/[accessPointSlug]/opengraph-image.tsx`

### Layout (Simplified)

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  [🦦] eddy.guide                [Huzzah Creek]  chip    │
│                                                          │
│  Red Bluff Access                ← Primary focus         │
│  Public access                                           │
│                                                          │
│  [████ Optimal ████]        FLOATABLE: Yes              │
│                                                          │
│                          Plan your float trip with Eddy  │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 4px status bar │
└──────────────────────────────────────────────────────────┘
```

### Design Specifics

**Full-width card.** Padding 40px.

1. **Header row:** Flex, space-between
   - Left: Eddy brand mark (same pattern)
   - Right: River chip — Space Grotesk 12px SemiBold, border-radius 100px, padding 5px 14px, `rgba(57,160,202,0.15)` bg, `#39a0ca` text

2. **Access point name:** Space Grotesk 40px Bold, white, truncate at 25 chars. Margin-bottom 8px.

3. **Access type:** Inter 16px, `rgba(255,255,255,0.6)`. Format: `"[Public/Private] access"`

4. **Data row:** Flex with 32px gap, margin-top 28px
   - **Status badge:** Large variant (same as River card)
   - **Floatable:**
     - Label: Inter 11px SemiBold uppercase, `rgba(255,255,255,0.5)`
     - Value: Space Grotesk 20px Bold. "Yes" in `#84cc16`, "No" in `#ef4444`

5. **Bottom accent bar:** Same as River card

6. **Tagline:** Bottom-right, same style

### Dynamic Data

```ts
interface AccessPointOGData {
  name: string;            // "Red Bluff Access"
  type: string;            // "Public" | "Private"
  riverName: string;       // "Huzzah Creek"
  gaugeStatus: ConditionCode;
  floatable: boolean;      // true
}
```

---

## Card 4: Gauge Station

**Route:** `src/app/gauges/[stationId]/opengraph-image.tsx`

### Layout

```
┌────────────────────────────────────────┬─────────────────┐
│                                        │                 │
│  [🦦] eddy.guide                       │    ╭───────╮    │
│                                        │    │       │    │
│  Huzzah Creek                          │    │  3.2  │    │
│  near Steelville                       │    │  ft   │    │
│  USGS 07013000                         │    ╰───────╯    │
│                                        │   glow behind   │
│  [████ Optimal ████]                   │                 │
│                                        │                 │
│  RIVERS: Huzzah Creek                  │                 │
│                                        │                 │
│  Plan your float trip with Eddy        │                 │
└────────────────────────────────────────┴─────────────────┘
```

### Design Specifics

**Two-panel layout** — the gauge ring is a distinctive brand element worth keeping.

- **Info panel (flex: 1):** padding 40px, flex column
- **Gauge visual panel (200px wide):** centered gauge ring

**Info panel elements:**

1. **Eddy brand mark:** Same pattern

2. **Station name:** Space Grotesk 32px Bold, white, max 2 lines. Margin-bottom 8px.

3. **Station ID:** Inter 13px, `rgba(255,255,255,0.5)`, letter-spacing 0.3px
   - Format: `"USGS [stationId]"`

4. **Status badge:** Medium variant (14px), margin-top 20px

5. **Rivers list:**
   - Label: Inter 11px SemiBold uppercase, `rgba(255,255,255,0.5)`, margin-top 20px
   - Value: Space Grotesk 16px SemiBold white. If empty: "No linked rivers"

6. **Tagline:** Bottom-left

**Gauge visual panel:**

1. **Background glow:** 180px circle, filter blur(40px), opacity 0.2, color based on status

2. **Gauge ring:** 140px circle, centered
   - Border: 5px solid, status color at 50% opacity
   - Background: status color at 10% opacity
   - Contains:
     - Reading: Space Grotesk 36px Bold white
     - Unit: Inter 12px Medium, `rgba(255,255,255,0.6)`, uppercase

### Dynamic Data

```ts
interface GaugeOGData {
  stationName: string;        // "Huzzah Creek near Steelville"
  stationId: string;          // "07013000"
  reading: number | null;     // 3.2
  unit: string;               // "ft"
  status: ConditionCode;
  associatedRivers: string[]; // ["Huzzah Creek"]
}
```

---

## Card 5: Float Plan (NEW)

**Route:** `src/app/plan/opengraph-image.tsx`

This card is generated when users share a planned float trip.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  [🦦 100px]  HUZZAH CREEK           ← River name LARGE  │
│                                                          │
│  ■ Bass Access  →  ■ Red Bluff      ← Put-in/Take-out  │
│                                                          │
│  ╔════════════════════════════════════════════════════╗  │
│  ║              OPTIMAL                               ║  │
│  ╚════════════════════════════════════════════════════╝  │
│                                                          │
│  GAUGE HEIGHT        3.2 ft                              │
│                                                          │
│  [USGS 07013000]                     eddy.guide          │
└──────────────────────────────────────────────────────────┘
```

### Design Specifics

- **Background:** `#1A3D40` (matches existing plan card)
- **Padding:** 32px 40px

**Elements:**

1. **Eddy mascot:** 100px, condition-based variant (green/yellow/red otter from blob storage)

2. **River name:** Space Grotesk 52px Bold, white, uppercase. Positioned to right of otter.

3. **Put-in / Take-out row:**
   - 18px colored squares: Put-in `#4EB86B`, Take-out `#F07052`
   - Space Grotesk 20px SemiBold, white
   - Truncate names at 15 chars each

4. **Condition banner:** Full-width, prominent
   - Padding 20px 32px
   - Background: status color (solid)
   - Border: 4px solid black (brutalist style)
   - Text: Space Grotesk 64px Bold, status-appropriate text color

5. **Gauge data:**
   - Label: Inter 12px SemiBold, `#72B5C4`, letter-spacing 0.1em
   - Value: Space Grotesk 44px Bold, white

6. **Gauge name chip:** Bottom-left
   - Padding 8px 14px
   - Background: `rgba(255,255,255,0.08)`
   - Border: 2px solid `rgba(255,255,255,0.15)`
   - Text: Inter 14px SemiBold, `#A3D1DB`

7. **Domain watermark:** "eddy.guide" bottom-right, same style as other cards

### Dynamic Data

```ts
interface FloatPlanOGData {
  river: string;           // "Huzzah Creek"
  putIn: string;           // "Bass Access"
  takeOut: string;         // "Red Bluff Access"
  condition: ConditionCode;
  gaugeName: string;       // "USGS 07013000"
  gaugeHeight: string | null;  // "3.2"
}
```

### Condition-based Otter Images

```ts
const OTTER_IMAGES: Record<ConditionCode, string> = {
  optimal:   'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  low:       'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  very_low:  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  high:      'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  too_low:   'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
  dangerous: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  unknown:   'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
};
```

---

## Implementation Guide

### File Structure

```
src/app/
├── opengraph-image.tsx          ← Homepage OG
├── twitter-image.tsx            ← Homepage Twitter
├── rivers/
│   └── [slug]/
│       ├── opengraph-image.tsx  ← River page OG
│       ├── twitter-image.tsx
│       └── [accessPointSlug]/
│           ├── opengraph-image.tsx  ← Access point OG
│           └── twitter-image.tsx
├── gauges/
│   └── [stationId]/
│       ├── opengraph-image.tsx  ← Gauge station OG
│       └── twitter-image.tsx
├── plan/
│   ├── opengraph-image.tsx      ← Float plan OG
│   └── twitter-image.tsx
└── lib/
    └── og/
        ├── colors.ts            ← Status colors and utilities
        ├── fonts.ts             ← Font loading utility
        ├── components.tsx       ← Reusable components (EddyMark, StatusBadge)
        └── types.ts             ← Shared types
```

### Font Loading

Download and place font files in `src/app/fonts/`:
- SpaceGrotesk-Bold.ttf
- SpaceGrotesk-SemiBold.ttf
- Inter-Regular.ttf
- Inter-Medium.ttf

```ts
// src/lib/og/fonts.ts
export async function loadOGFonts() {
  const [spaceGroteskBold, spaceGroteskSemiBold, interRegular, interMedium] =
    await Promise.all([
      fetch(new URL('../../app/fonts/SpaceGrotesk-Bold.ttf', import.meta.url)).then(r => r.arrayBuffer()),
      fetch(new URL('../../app/fonts/SpaceGrotesk-SemiBold.ttf', import.meta.url)).then(r => r.arrayBuffer()),
      fetch(new URL('../../app/fonts/Inter-Regular.ttf', import.meta.url)).then(r => r.arrayBuffer()),
      fetch(new URL('../../app/fonts/Inter-Medium.ttf', import.meta.url)).then(r => r.arrayBuffer()),
    ]);

  return [
    { name: 'Space Grotesk', data: spaceGroteskBold, weight: 700 as const, style: 'normal' as const },
    { name: 'Space Grotesk', data: spaceGroteskSemiBold, weight: 600 as const, style: 'normal' as const },
    { name: 'Inter', data: interRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: interMedium, weight: 500 as const, style: 'normal' as const },
  ];
}
```

### Eddy Avatar Loading

```ts
export async function loadEddyAvatar(): Promise<string> {
  const response = await fetch(
    'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png'
  );
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}
```

### Satori Constraints

Remember these limitations:

1. **Flexbox only** — no CSS Grid
2. **All elements must have `display: flex`**
3. **Images need overflow:hidden wrapper for border-radius**
4. **Font family strings must exactly match** the `name` field
5. **Use inline styles** for maximum control
6. **Images must be absolute URLs or base64**

### Migration Notes

**Delete these files after implementation:**
- `src/app/api/og/route.tsx`
- `src/app/api/og/river/route.tsx`
- `src/app/api/og/gauges/route.tsx`
- `src/app/api/og/plan/route.tsx`
- `src/app/api/og/share/route.tsx`

Update any existing `generateMetadata` calls that reference `/api/og/` paths.

### Performance

- Use `revalidate` or `Cache-Control: s-maxage=300` (5 min) to cache images
- Font files are bundled locally — no CDN latency
- Eddy avatar is small (~few KB)

---

## Design Principles

- **Dark, rich backgrounds** — not white cards
- **Eddy brand mark always present**
- **Status immediately visible** — even at thumbnail size via bottom bar color
- **Clear typography hierarchy** — one hero element per card
- **Real, useful data** — gauge readings and status provide actual value
- **Truncate gracefully** — never let text overflow or wrap awkwardly
