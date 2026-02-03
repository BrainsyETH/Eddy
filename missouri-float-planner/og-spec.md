# eddy.guide — Open Graph Image Spec for Claude Code

## Overview

Revamp all social preview cards (OG images) across eddy.guide. These cards appear when any eddy.guide URL is shared on Facebook, Twitter/X, iMessage, Discord, Slack, LinkedIn, etc.

**Target:** 1200×630px PNG images generated dynamically at the edge using Next.js `ImageResponse` (from `next/og` / Satori).

**Page types requiring unique OG cards:**
1. Homepage (`/`)
2. River pages (`/rivers/[slug]`)
3. Access point pages (`/rivers/[slug]/[accessPointSlug]`)
4. Gauge station pages (`/gauges/[stationId]`)

---

## Brand System (Reference)

### Colors

```ts
const COLORS = {
  // Brand core (from Eddy mascot prompt)
  adventureNight: '#161748',   // Primary dark — all card backgrounds
  greenTreeline: '#478559',    // Eddy branding, nature accent
  bluewater: '#39a0ca',        // Links, water elements, info accent
  accentCoral: '#F07052',      // CTAs, highlights, sunglasses pink

  // Extended palette
  deepWater: '#0B2545',
  riverBlue: '#1B4965',
  skyBlue: '#62B6CB',
  mossGreen: '#81B29A',
  shallowBlue: '#BEE9E8',
  sandbar: '#F4F1DE',

  // Status colors (gauge conditions)
  statusTooLow: '#F07052',
  statusLow: '#e8997a',
  statusOkay: '#c9b060',
  statusOptimal: '#6bc98a',
  statusHigh: '#62B6CB',
  statusFlood: '#c94040',
} as const;
```

### Typography

- **Headings/Display:** Space Grotesk (Bold 700, SemiBold 600)
- **Body/Secondary:** Inter (Regular 400, Medium 500)
- Both fonts must be loaded as ArrayBuffers for Satori rendering (see implementation section)

### Eddy Mascot Image

The main Eddy mascot PNG lives at:
```
https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png
```

For OG images, use `Eddy_favicon.png` (smaller, works better at small sizes):
```
https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png
```

Fetch the mascot image at build/request time and pass it as a base64 `src` in the `<img>` tag within the `ImageResponse` JSX.

---

## Tagline

Use consistently across all cards:
- **Primary:** `Plan your float trip with Eddy`
- **Descriptive (homepage only):** `Missouri's Ozark rivers — live gauges, access points, and trip planning`

---

## Card 1: Homepage

**Route:** `src/app/opengraph-image.tsx` (or `src/app/(main)/opengraph-image.tsx` depending on route group)

**Also create:** `src/app/twitter-image.tsx` (same design, same dimensions)

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
- **Title:** Space Grotesk 38px Bold, white. "with Eddy" portion colored `#39a0ca`
- **Tagline:** Inter 16px, `rgba(255,255,255,0.65)`
- **Pill badges:** 3 pills in a row with 8px gap
  - "Live USGS Data" — blue: `rgba(57,160,202,0.2)` bg, `#39a0ca` text, 1px border `rgba(57,160,202,0.3)`
  - "30+ Access Points" — green: `rgba(71,133,89,0.2)` bg, `#81B29A` text, 1px border `rgba(71,133,89,0.3)`
  - "Float Times" — coral: `rgba(240,112,82,0.15)` bg, `#F07052` text, 1px border `rgba(240,112,82,0.25)`
  - Font: Space Grotesk 11px SemiBold, border-radius 100px, padding 5px 12px
- **Wave lines:** 3 horizontal lines near bottom, using linear gradients from transparent → `rgba(57,160,202,0.3-0.5)` → transparent. Stagger vertically with decreasing opacity.
- **Water texture:** Gradient overlay at bottom: `rgba(57,160,202,0.15)` → transparent, height ~80px
- **Domain watermark:** "eddy.guide" bottom-right, Space Grotesk 13px SemiBold, `rgba(255,255,255,0.35)`
- **Padding:** 48px left, centered vertically

### Static Data

No dynamic data required. Eddy mascot image is the only external asset.

### Metadata

```ts
export const alt = 'Plan your float trip with Eddy — Missouri Ozark river trip planner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
```

---

## Card 2: River Page

**Route:** `src/app/rivers/[slug]/opengraph-image.tsx`

### Layout

```
┌────────────────────────────────────────────┬─────────────┐
│                                            │             │
│  [🦦] eddy.guide                           │    ●  PUT-IN│
│                                            │    │        │
│  Huzzah Creek                              │    │        │
│                                            │    │  river  │
│  COUNTY        ACCESS PTS    GAUGE LEVEL   │    │  path   │
│  Crawford      8             3.2 ft        │    │        │
│                                            │    │        │
│  [● Optimal — Great for floating]          │    ●  TAKE- │
│                                            │       OUT   │
│  Plan your float trip with Eddy            │             │
└────────────────────────────────────────────┴─────────────┘
```

### Design Specifics

**Two-panel layout:**

- **Left panel (flex: 1):** padding 32px 36px, flex column, justify center
- **Right panel (200px wide):** Abstract river visualization

**Left panel elements:**

1. **Eddy mark:** 28px green gradient circle (same as homepage) + "eddy.guide" in Space Grotesk 12px SemiBold, `rgba(255,255,255,0.45)`. 8px gap. Margin-bottom 14px.

2. **River name:** Space Grotesk 34px Bold, white, letter-spacing -0.5px. Margin-bottom 12px.

3. **Metadata row:** 3 items with 16px gap, each a vertical stack:
   - Label: 9px SemiBold, `rgba(255,255,255,0.35)`, uppercase, letter-spacing 1px
   - Value: Space Grotesk 15px SemiBold, white
   - Items: County, Access Points count, Gauge Level (reading + unit)

4. **Status badge:** Inline-flex, border-radius 100px, padding 6px 14px
   - Space Grotesk 12px SemiBold
   - Contains a 7px status dot + text
   - Color determined by gauge status (see Status Color Map below)
   - Text format: `"[Status] — [Description]"`
     - Too Low → "Too Low — Not floatable"
     - Low → "Low — Marginal conditions"
     - Okay → "Okay — Floatable with caution"
     - Optimal → "Optimal — Great for floating"
     - High → "High — Fast current, use caution"
     - Flood → "Flood — Dangerous, do not float"

5. **Tagline:** Space Grotesk 12px Medium, `rgba(255,255,255,0.25)`, positioned absolute bottom 16px left 36px

**Right panel elements:**

- Background: Linear gradient 180deg from `#1B4965` → `#39a0ca` → `#0B2545`
- **River path:** 4px wide vertical line, centered horizontally, full height, `rgba(255,255,255,0.25)`, border-radius 2px
- **Put-in pin:** 16px circle at 20% from top, centered on path. Border 2.5px white, fill `#478559`. Label "PUT-IN" to the right, Space Grotesk 9px SemiBold `rgba(255,255,255,0.7)` uppercase.
- **Take-out pin:** Same as put-in but at 75% from top, fill `#F07052`. Label "TAKE-OUT".

### Dynamic Data

```ts
// Data to fetch for this card:
interface RiverOGData {
  name: string;              // "Huzzah Creek"
  county: string;            // "Crawford"
  accessPointCount: number;  // 8
  gaugeReading: number;      // 3.2
  gaugeUnit: string;         // "ft"
  gaugeStatus: GaugeStatus;  // "optimal"
}

type GaugeStatus = 'too_low' | 'low' | 'okay' | 'optimal' | 'high' | 'flood';
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

### Layout

```
┌──────────────────────────────────────────────────────────┐
│                                           ╱╱╱ glow      │
│  [🦦] eddy.guide                [Huzzah Creek]  chip    │
│                                                          │
│  Red Bluff Access                                        │
│  Public access — Crawford County, MO                     │
│                                                          │
│  GAUGE LEVEL  │  STATUS          │  FLOATABLE            │
│  3.2 ft       │  [● Optimal]     │  Yes                  │
│                                                          │
│                          Plan your float trip with Eddy  │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 4px status bar │
└──────────────────────────────────────────────────────────┘
```

### Design Specifics

**Full-width card, no panels.** Padding 32px 40px, flex column, justify center.

1. **Corner accent:** Top-right, 160px × 160px radial gradient `rgba(57,160,202,0.12)` → transparent. Subtle depth detail.

2. **Header row:** Flex, space-between, margin-bottom 18px
   - Left: Eddy brand mark (26px icon + "eddy.guide" text, same pattern)
   - Right: River chip — Space Grotesk 11px SemiBold, border-radius 100px, padding 4px 12px, `rgba(57,160,202,0.15)` bg, `#39a0ca` text, 1px border `rgba(57,160,202,0.25)`

3. **Access point name:** Space Grotesk 32px Bold, white, letter-spacing -0.5px, margin-bottom 6px

4. **Access type line:** Inter 13px, `rgba(255,255,255,0.45)`, margin-bottom 20px
   - Format: `"[Public/Private] access — [County], MO"`

5. **Data row:** Flex with 24px gap, items center
   - **Gauge Level block:**
     - Label: 9px SemiBold uppercase `rgba(255,255,255,0.3)`, letter-spacing 1.2px
     - Value: Space Grotesk 18px Bold white. Unit in 12px Medium `rgba(255,255,255,0.5)`
   - **Divider:** 1px × 36px, `rgba(255,255,255,0.1)`
   - **Status block:**
     - Label: same as gauge label
     - Value: Status badge (smaller variant: 11px, padding 4px 10px)
   - **Divider**
   - **Floatable block:**
     - Label: same pattern
     - Value: Space Grotesk 18px Bold. "Yes" in `#6bc98a`, "No" in `#F07052`

6. **Bottom accent bar:** Absolute bottom, full width, 4px height
   - Gradient left-to-right using status color → lighter variant
   - Optimal: `#478559` → `#81B29A`
   - Low/Too Low: `#F07052` → `#e8997a`
   - High: `#39a0ca` → `#62B6CB`
   - Okay: `#c9b060` → `#d4c47a`
   - Flood: `#c94040` → `#d46a6a`

7. **Tagline:** "Plan your float trip with Eddy", absolute bottom-right (16px from bottom, 24px from right), Space Grotesk 11px Medium, `rgba(255,255,255,0.2)`

### Dynamic Data

```ts
interface AccessPointOGData {
  name: string;            // "Red Bluff Access"
  type: string;            // "Public" | "Private"
  county: string;          // "Crawford"
  riverName: string;       // "Huzzah Creek"
  gaugeReading: number;    // 3.2
  gaugeUnit: string;       // "ft"
  gaugeStatus: GaugeStatus;
  floatable: boolean;      // true
}
```

### Metadata

```ts
export const alt = `${accessPoint.name} on ${river.name} — eddy.guide`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
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
│  near Steelville                       │    │ ft    │    │
│  USGS 07013000 · Crawford County       │    ╰───────╯    │
│                                        │   glow behind   │
│  STATUS              RIVERS            │                 │
│  [● Optimal]         Huzzah Creek      │                 │
│                                        │                 │
│  Plan your float trip with Eddy        │                 │
└────────────────────────────────────────┴─────────────────┘
```

### Design Specifics

**Two-panel layout:**

- **Info panel (flex: 1):** padding 32px 36px, flex column, justify center
- **Gauge visual panel (220px wide):** centered gauge ring with glow

**Info panel elements:**

1. **Eddy brand mark:** Same pattern as other cards (24px icon variant)

2. **Station name:** Space Grotesk 26px Bold, white, line-height 1.15. May be multi-line (e.g., "Huzzah Creek\nnear Steelville"). Margin-bottom 6px.

3. **Station ID:** Inter 11px, `rgba(255,255,255,0.3)`, letter-spacing 0.3px, margin-bottom 16px
   - Format: `"USGS [stationId] · [County] County"`

4. **Metadata row:** Flex with 20px gap
   - STATUS: Label + status badge (same pattern)
   - RIVERS: Label + Space Grotesk 14px SemiBold white listing associated rivers

5. **Tagline:** Absolute bottom-left, same as other cards

**Gauge visual panel:**

1. **Background glow:** 180px circle, filter blur(40px), opacity 0.15, color based on status

2. **Gauge ring:** 130px circle, centered
   - Border: 4px solid, color based on status at 40% opacity
   - Background: status color at 8% opacity
   - Contains:
     - Reading: Space Grotesk 32px Bold white, line-height 1
     - Unit: Inter 10px, `rgba(255,255,255,0.45)`, uppercase, letter-spacing 1px, margin-top 4px
     - Format unit as: `"[unit] · gage height"`

### Status-to-Ring Color Map

```ts
const RING_STYLES: Record<GaugeStatus, { border: string; bg: string; glow: string }> = {
  too_low: { border: 'rgba(240,112,82,0.4)', bg: 'rgba(240,112,82,0.08)', glow: '#F07052' },
  low:     { border: 'rgba(240,112,82,0.4)', bg: 'rgba(240,112,82,0.08)', glow: '#F07052' },
  okay:    { border: 'rgba(201,176,96,0.4)', bg: 'rgba(201,176,96,0.08)', glow: '#c9b060' },
  optimal: { border: 'rgba(71,133,89,0.4)',  bg: 'rgba(71,133,89,0.08)',  glow: '#478559' },
  high:    { border: 'rgba(57,160,202,0.4)', bg: 'rgba(57,160,202,0.08)', glow: '#39a0ca' },
  flood:   { border: 'rgba(201,64,64,0.4)',  bg: 'rgba(201,64,64,0.08)',  glow: '#c94040' },
};
```

### Dynamic Data

```ts
interface GaugeOGData {
  stationName: string;      // "Huzzah Creek near Steelville"
  stationId: string;        // "07013000"
  county: string;           // "Crawford"
  reading: number;          // 3.2
  unit: string;             // "ft"
  status: GaugeStatus;
  associatedRivers: string[]; // ["Huzzah Creek"]
}
```

### Metadata

```ts
export const alt = `${gauge.stationName} — USGS ${gauge.stationId} river gauge on eddy.guide`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
```

---

## Implementation Guide

### File Structure

```
src/app/
├── opengraph-image.tsx          ← Homepage OG
├── twitter-image.tsx            ← Homepage Twitter (same design)
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
└── lib/
    └── og/
        ├── colors.ts            ← Shared color constants
        ├── fonts.ts             ← Font loading utility
        ├── eddy-avatar.tsx      ← Reusable Eddy brand mark component
        ├── status-badge.tsx     ← Reusable status badge component
        └── types.ts             ← Shared types (GaugeStatus, etc.)
```

### Font Loading

Satori requires fonts as ArrayBuffers. Create a shared font loader:

```ts
// src/lib/og/fonts.ts
export async function loadFonts() {
  const [spaceGroteskBold, spaceGroteskSemiBold, interRegular, interMedium] =
    await Promise.all([
      fetch(
        new URL('../../assets/fonts/SpaceGrotesk-Bold.ttf', import.meta.url)
      ).then((res) => res.arrayBuffer()),
      fetch(
        new URL('../../assets/fonts/SpaceGrotesk-SemiBold.ttf', import.meta.url)
      ).then((res) => res.arrayBuffer()),
      fetch(
        new URL('../../assets/fonts/Inter-Regular.ttf', import.meta.url)
      ).then((res) => res.arrayBuffer()),
      fetch(
        new URL('../../assets/fonts/Inter-Medium.ttf', import.meta.url)
      ).then((res) => res.arrayBuffer()),
    ]);

  return [
    { name: 'Space Grotesk', data: spaceGroteskBold, weight: 700, style: 'normal' },
    { name: 'Space Grotesk', data: spaceGroteskSemiBold, weight: 600, style: 'normal' },
    { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
    { name: 'Inter', data: interMedium, weight: 500, style: 'normal' },
  ];
}
```

**Important:** Download the TTF/OTF font files and place them in `src/assets/fonts/`. Google Fonts CDN URLs do not work with Satori — you must bundle the actual font files.

### Eddy Avatar Loading

```ts
// Fetch and convert to base64 data URL for use in <img> tags within ImageResponse
export async function loadEddyAvatar(): Promise<string> {
  const response = await fetch(
    'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png'
  );
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}
```

### Status Color Utility

```ts
// src/lib/og/colors.ts

export type GaugeStatus = 'too_low' | 'low' | 'okay' | 'optimal' | 'high' | 'flood';

export function getStatusColor(status: GaugeStatus) {
  const map = {
    too_low: { solid: '#F07052', text: '#F07052', bg: 'rgba(240,112,82,0.15)', border: 'rgba(240,112,82,0.25)', label: 'Too Low' },
    low:     { solid: '#e8997a', text: '#e8997a', bg: 'rgba(240,112,82,0.15)', border: 'rgba(240,112,82,0.25)', label: 'Low' },
    okay:    { solid: '#c9b060', text: '#c9b060', bg: 'rgba(201,176,96,0.15)', border: 'rgba(201,176,96,0.25)', label: 'Okay' },
    optimal: { solid: '#6bc98a', text: '#6bc98a', bg: 'rgba(71,133,89,0.2)',   border: 'rgba(71,133,89,0.35)',  label: 'Optimal' },
    high:    { solid: '#62B6CB', text: '#62B6CB', bg: 'rgba(57,160,202,0.2)',  border: 'rgba(57,160,202,0.3)',  label: 'High' },
    flood:   { solid: '#c94040', text: '#c94040', bg: 'rgba(201,64,64,0.15)',  border: 'rgba(201,64,64,0.25)', label: 'Flood' },
  };
  return map[status];
}

export function getStatusDescription(status: GaugeStatus): string {
  const descriptions = {
    too_low: 'Not floatable',
    low: 'Marginal conditions',
    okay: 'Floatable with caution',
    optimal: 'Great for floating',
    high: 'Fast current, use caution',
    flood: 'Dangerous, do not float',
  };
  return descriptions[status];
}

// For bottom accent bars and gradient elements
export function getStatusGradient(status: GaugeStatus): [string, string] {
  const gradients: Record<GaugeStatus, [string, string]> = {
    too_low: ['#F07052', '#e8997a'],
    low:     ['#F07052', '#e8997a'],
    okay:    ['#c9b060', '#d4c47a'],
    optimal: ['#478559', '#81B29A'],
    high:    ['#39a0ca', '#62B6CB'],
    flood:   ['#c94040', '#d46a6a'],
  };
  return gradients[status];
}
```

### Satori / ImageResponse Constraints

Remember these limitations when writing the JSX for `ImageResponse`:

1. **Flexbox only** — no CSS Grid, no `position: absolute` as primary layout (use sparingly for overlays)
2. **No `border-radius` on images in all cases** — wrap in a div with overflow hidden + border-radius instead
3. **All elements must have `display: flex`** — Satori defaults differ from browser CSS
4. **Font family strings must exactly match** the `name` field in font definitions
5. **No `gap` shorthand on some versions** — test and fall back to margins if needed
6. **Use `tw` prop if using `@vercel/og` with Tailwind** — or inline styles (inline styles recommended for maximum control and reliability)
7. **Images must be absolute URLs or base64 data URLs** — relative paths don't work

### Page Metadata Integration

Each page with an OG image also needs proper metadata. Ensure `generateMetadata` (or static `metadata`) includes:

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const river = await getRiver(params.slug);
  const gauge = await getGaugeForRiver(river.id);

  return {
    title: `${river.name} — eddy.guide`,
    description: `Check current conditions for ${river.name}. ${gauge.status} at ${gauge.reading}${gauge.unit}. Plan your float trip with Eddy.`,
    openGraph: {
      title: `${river.name} — Float Conditions`,
      description: `Currently ${gauge.status} at ${gauge.reading}${gauge.unit}. ${getStatusDescription(gauge.status)}.`,
      siteName: 'eddy.guide',
      type: 'website',
      // OG image is auto-discovered from opengraph-image.tsx in the same route segment
    },
    twitter: {
      card: 'summary_large_image',
      title: `${river.name} — eddy.guide`,
      description: `Currently ${gauge.status} at ${gauge.reading}${gauge.unit}.`,
      // Twitter image is auto-discovered from twitter-image.tsx
    },
  };
}
```

### Testing & Validation

After implementation, verify cards render correctly:

1. **Local preview:** Visit `/opengraph-image` (or `/rivers/huzzah-creek/opengraph-image`) directly in the browser — Next.js serves the PNG
2. **Facebook Debugger:** https://developers.facebook.com/tools/debug/
3. **Twitter Card Validator:** https://cards-dev.twitter.com/validator
4. **LinkedIn Post Inspector:** https://www.linkedin.com/post-inspector/
5. **OpenGraph.xyz:** https://www.opengraph.xyz/
6. **Thumbnail test:** View the card at 120×63px (the smallest typical thumbnail) — key info should still be legible

### Performance Notes

- All dynamic OG images fetch live gauge data, so they should use reasonable cache headers. Consider `revalidate` on the route segment or `Cache-Control: s-maxage=300` (5 min) to avoid hammering the USGS API on every social media crawler hit.
- Font files are bundled, not fetched from CDN — this keeps edge function cold starts fast.
- Eddy avatar is a small PNG (~few KB) — the fetch is negligible.

---

## Design Principles (Anti-AI-Slop Checklist)

These cards should NOT look like generic AI-generated social previews. Key differentiators:

- **Dark, rich backgrounds** — not white cards with drop shadows
- **The Eddy brand mark is always present** — not a generic logo or text-only
- **Status is color-coded and immediately visible** — even at tiny thumbnail sizes the bottom bar or ring color communicates conditions
- **Typography has clear hierarchy** — one hero element per card, supporting data is secondary
- **Restrained color usage** — only status determines color variation, everything else is consistent Adventure Night dark + white text
- **No stock photos, no AI-generated landscapes** — the abstract river path, gauge ring, and wave lines are the visual vocabulary
- **Data is real and useful** — the gauge reading, status, and floatability give the card actual utility beyond just branding
