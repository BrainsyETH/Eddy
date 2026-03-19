# Design System: Eddy — Missouri Float Trip Planner
**Project ID:** *(pending — set after `create_project` via Stitch MCP)*

---

## 1. Visual Theme & Atmosphere

**Aesthetic:** Organic Brutalist — bold and grounded with natural warmth. The design merges the tactile, handcrafted energy of brutalism (chunky offset shadows, thick borders, strong geometric structure) with the organic softness of nature (warm earth tones, rounded corners, flowing animations). It feels like a hand-painted trail sign meets a modern data dashboard.

**Vibe Keywords:** Earthy, tactile, warm, grounded, bold, playful, approachable, outdoorsy, trustworthy.

**Mascot:** Eddy the Otter — a friendly river otter character that appears throughout the app as a guide, in the FAB chat button, hero sections, empty states, and condition indicators. Uses the rounded display font (Fredoka) for branding text.

**Platform:** Web, Desktop-first with mobile-responsive bottom sheets and collapsible panels.

---

## 2. Color Palette & Roles

### Primary — Deep River Teal
The backbone of the interface. Used for navigation chrome, headers, map overlays, and trust-signaling surfaces.

| Swatch | Hex | Role |
|:---|:---|:---|
| Primary 900 | `#0F2D35` | Deepest teal — hero gradient endpoints, footer |
| Primary 800 | `#163F4A` | Header background, sidebar headers, dark surfaces |
| Primary 700 | `#1D525F` | Card borders, secondary text on dark, shadow-primary |
| Primary 600 | `#256574` | Popup borders, hover accents |
| **Primary 500** | **`#2D7889`** | **Base — info color, focus rings, links** |
| Primary 400 | `#4A9AAD` | Hover borders, interactive highlights |
| Primary 300 | `#72B5C4` | Stats text, muted data on dark backgrounds |
| Primary 200 | `#A3D1DB` | Spinner tracks, selection highlight background |
| Primary 100 | `#D4EAEF` | Descriptions on dark backgrounds, focus ring fill |
| Primary 50 | `#EBF5F7` | Subtle hover backgrounds, button hover tints |

### Secondary — Sandbar Tan
Warm, supportive surfaces that feel like sun-baked riverbank sand. Used for trip summary cards and secondary containers.

| Swatch | Hex | Role |
|:---|:---|:---|
| **Secondary 500** | **`#B89D72`** | **Base — warm accent, supporting elements** |
| Secondary 200 | `#E8DFD0` | Badge backgrounds |
| Secondary 100 | `#F4EFE7` | Light card backgrounds |
| Secondary 50 | `#FAF8F4` | Trip card background, warm surface tint |

### Accent — Sunset Coral
The attention-grabber. Used for primary CTAs, active states, and the Eddy brand signature color.

| Swatch | Hex | Role |
|:---|:---|:---|
| **Accent 500** | **`#F07052`** | **Base — primary CTA buttons, Eddy branding color** |
| Accent 600 | `#E5573F` | Button hover, colored shadow |
| Accent 400 | `#F48E76` | Active nav highlight on dark backgrounds |
| Accent 300 | `#F7AC9A` | Focus ring for accent elements |
| Accent 100 | `#FDE7E1` | Badge accent backgrounds |
| Accent 50 | `#FEF5F3` | Selected card backgrounds |

### Support — Trail Green
Nature's confirmation. Used for success states, optimal conditions, put-in markers, and nature callouts.

| Swatch | Hex | Role |
|:---|:---|:---|
| **Support 500** | **`#4EB86B`** | **Base — success, optimal conditions, put-in markers** |
| Support 700 | `#347A47` | Optimal badge text |
| Support 300 | `#95D9A7` | Optimal badge border |
| Support 100 | `#DCF4E2` | Optimal badge background |

### Neutrals — Warm Stone
Not cold grays — these are warm, sandstone-toned neutrals that feel organic and earthy.

| Swatch | Hex | Role |
|:---|:---|:---|
| Neutral 950 | `#1A1814` | Darkest — dark mode background |
| Neutral 900 | `#2D2A24` | Primary text, dark button borders |
| Neutral 800 | `#3F3B33` | Dark mode surfaces |
| Neutral 700 | `#524D43` | Dark mode borders |
| Neutral 600 | `#6B6459` | Secondary text, xl shadow color |
| Neutral 500 | `#857D70` | Muted text, lg shadow color |
| Neutral 400 | `#A49C8E` | md shadow color, hover borders |
| Neutral 300 | `#C2BAAC` | xs/sm shadow color, strong borders |
| Neutral 200 | `#DBD5CA` | Default borders, badge-neutral bg |
| Neutral 100 | `#EDEBE6` | Skeleton loaders, subtle backgrounds |
| Neutral 50 | `#F7F6F3` | Page background — warm off-white |

### Semantic / State Colors

| Name | Hex | Role |
|:---|:---|:---|
| Background | `#F7F6F3` | Page canvas (neutral-50) |
| Surface | `#FFFFFF` | Card/container backgrounds |
| Success | `#4EB86B` | Positive states (support-500) |
| Warning | `#E5A000` | Caution states |
| Error | `#DC2626` | Danger, flood conditions |
| Info | `#2D7889` | Informational (primary-500) |

### Condition Badge Colors (domain-specific)

| Condition | Background | Text | Border |
|:---|:---|:---|:---|
| Optimal | `#DCF4E2` | `#347A47` | `#95D9A7` |
| Low | `#FFFBEB` | `#92400E` | `#FCD34D` |
| High | `#FFF7ED` | `#9A3412` | `#FDBA74` |
| Danger/Flood | `#FEF2F2` | `#991B1B` | `#FCA5A5` |
| Unknown | `#EDEBE6` | `#6B6459` | `#C2BAAC` |

---

## 3. Typography Rules

| Role | Font Family | Weight | Usage |
|:---|:---|:---|:---|
| **Heading** | Geist Sans (`--font-heading`) | 700 (Bold) | Page titles, section headers, card headings. Tight letter-spacing (-0.02em). |
| **Body** | Geist Sans (`--font-body`) | 400–600 | Body copy, descriptions, form labels. Clean geometric sans-serif. |
| **Monospace** | Geist Mono (`--font-mono`) | 400 | Gauge readings, data values, code. |
| **Display** | Fredoka (`--font-display`) | 400–700 | "Eddy" brand name, hero titles, mascot callouts. Rounded, playful, friendly. |

### Type Scale

| Token | Size | Line Height | Usage |
|:---|:---|:---|:---|
| xs | 12px (0.75rem) | 1.4 | Badges, fine print, timestamps |
| sm | 14px (0.875rem) | 1.5 | Labels, secondary text, nav links |
| base | 16px (1rem) | 1.5 | Body copy, buttons, inputs |
| lg | 18px (1.125rem) | 1.6 | Section titles, collapsible headers |
| xl | 20px (1.25rem) | 1.4 | Card titles, sidebar headers |
| 2xl | 24px (1.5rem) | 1.3 | Sub-headings |
| 3xl | 30px (1.875rem) | 1.25 | Page headings (mobile) |
| 4xl | 36px (2.25rem) | 1.15 | Page headings (desktop) |
| 5xl | 48px (3rem) | 1.1 | Hero titles, brand display |
| 6xl | 60px (3.75rem) | 1.05 | Eddy logo text (Fredoka) |

---

## 4. Component Stylings

### Buttons

| Variant | Background | Border | Shadow | Shape | Behavior |
|:---|:---|:---|:---|:---|:---|
| **Primary** | Accent 500 (`#F07052`) | 2px solid Neutral 900 | md (3px 3px offset) | 6px rounded | Hover: lifts -1px, lg shadow. Active: pushes +2px, xs shadow. |
| **Secondary** | Transparent | 2px solid Primary 500 | None | 6px rounded | Hover: Primary-50 fill, darker border. |
| **Ghost** | Transparent | None | None | 4px rounded | Hover: Neutral-100 fill, primary text. |
| **Icon** | White surface | 2px solid Neutral 200 | None | 6px rounded, 40×40px | Hover: Primary-50 fill, primary border. |

### Cards

| Variant | Background | Border | Shadow | Radius | Behavior |
|:---|:---|:---|:---|:---|:---|
| **Standard** | White surface | 2px solid Primary 700 | md (3px 3px) | 8px | Hover: lifts -2px, lg shadow |
| **Trip Summary** | Secondary-50 (tan tint) | 3px solid Primary 600 | lg (4px 4px) | 12px | Static, no hover lift |
| **Access Point** | White surface | 2px solid Neutral 200 | None (soft on hover) | 6px | Hover: Primary-400 border. Selected: Accent-500 border, accent shadow |
| **Glass (light)** | rgba(255,255,255,0.95) | 2px solid Neutral 200 | soft-lg | 8px | For map overlays |
| **Glass (dark)** | rgba(15,45,53,0.95) | 2px solid Primary 700 | soft-lg | 8px | For dark map overlays |

### Badges

- **Shape:** Pill-shaped (border-radius: 9999px) for standard badges; 6px rounded for condition badges.
- **Sizing:** 12px font, 600 weight, 0.25rem 0.75rem padding.
- **Pattern:** Tinted background + dark text of same hue + optional 1px border.

### Form Elements

- **Inputs:** White surface, 2px neutral-300 border, 6px radius. Focus: primary-500 border + 3px primary-100 ring.
- **Selects:** Custom chevron SVG, same styling as inputs.
- **Labels:** 14px, 500 weight, 0.5rem bottom margin.

### Navigation

- **Header:** Sticky, Primary-800 background, 3px neutral-900 bottom border. Links are uppercase 14px 600 weight in primary-100, hover fills primary-700.
- **Active link:** Accent-400 text on primary-900 background.

---

## 5. Depth & Elevation System

The signature "Organic Brutalist" depth system uses **hard-edged offset shadows** in warm stone tones — never blurred, always directional (bottom-right).

| Token | Value | Usage |
|:---|:---|:---|
| xs | `1px 1px 0 #C2BAAC` | Active/pressed button states |
| sm | `2px 2px 0 #C2BAAC` | Hover on access cards |
| **md** | **`3px 3px 0 #A49C8E`** | **Default card shadow, primary buttons** |
| lg | `4px 4px 0 #857D70` | Hover-lifted cards, trip cards |
| xl | `6px 6px 0 #6B6459` | High-emphasis interactive elements |

**Soft variants** (for map overlays and non-brutalist contexts):
- soft-sm: `0 1px 3px rgba(45,42,36,0.1)`
- soft-md: `0 4px 6px rgba(45,42,36,0.1)`
- soft-lg: `0 10px 15px rgba(45,42,36,0.1)`

**Colored shadows** for emphasis:
- Accent: `3px 3px 0 #E5573F` (selected cards)
- Primary: `3px 3px 0 #1D525F` (primary-themed emphasis)

**Inset shadow** for pressed states: `inset 2px 2px 4px rgba(45,42,36,0.15)`

---

## 6. Layout Principles

- **Max content width:** 720px for text-heavy hero content.
- **Responsive breakpoints:** Mobile-first — sm (640px), md (768px), lg (1024px), xl (1280px).
- **Whitespace:** Generous — 1.25rem card padding, 1.5rem section spacing, 5rem hero padding.
- **Grid:** Cards use responsive grid (1-col mobile → 2-3 col desktop). Access cards use 3-column grid (icon | info | action).
- **Mobile patterns:** Bottom sheets for detail panels. Collapsible sections for dense content. Horizontal scroll strips for access point selection.
- **Touch targets:** 44px minimum on mobile.

---

## 7. Motion & Animation

| Name | Duration | Curve | Usage |
|:---|:---|:---|:---|
| float | 6s | ease-in-out, infinite | Eddy mascot subtle bobbing |
| ripple | 2s | ease-in-out, infinite | Pulsing emphasis |
| fade-in | 500ms | ease-out | Page content entry |
| slide-up | 500ms | ease-out | Content reveal on load |
| slide-in-right | 300ms | ease-out | Side panels, drawers |
| shimmer | 1.5s | linear, infinite | Skeleton loader sweep |

**Transition speeds:**
- Fast (100ms): Button interactions, hover states
- Normal (200ms): Color transitions, border changes
- Slow (300ms): Large element movements, panels

**Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` default; `cubic-bezier(0, 0, 0.2, 1)` for exits; `cubic-bezier(0.68, -0.55, 0.265, 1.55)` for bouncy mascot animations.

**Reduced motion:** All animations collapse to 0.01ms for users with `prefers-reduced-motion`.

---

## 8. Gradients

| Name | Value | Usage |
|:---|:---|:---|
| Page gradient | `linear-gradient(180deg, #F7F6F3, #EDEBE6)` | Subtle warm page bg |
| Primary gradient | `linear-gradient(180deg, #163F4A, #0F2D35)` | Hero/header backgrounds |
| Accent gradient | `linear-gradient(180deg, #F07052, #E5573F)` | CTA emphasis |
| Water text | `linear-gradient(135deg, #2D7889, #4EB86B)` | Gradient text effect |
| Sunset text | `linear-gradient(135deg, #F07052, #2D7889)` | Brand gradient text |
| Hero diagonal | `linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)` | River page heroes |

---

## 9. Borders

| Token | Width | Usage |
|:---|:---|:---|
| thin | 1px | Subtle separators, condition badge borders, glass cards |
| **base** | **2px** | **Default — card borders, buttons, inputs, popups** |
| thick | 3px | Trip summary cards, header bottom border, emphasis |
| chunky | 4px | Maximum emphasis, rarely used |

---

## 10. Screen Inventory

| # | Screen | Key Components | Atmosphere |
|:---|:---|:---|:---|
| 1 | **Home** | Hero with Eddy mascot (floating animation), conditions dashboard grid, "Ask Eddy" CTA card, river selector dropdown | Welcoming, playful, informative |
| 2 | **Rivers List** | 2-column responsive card grid with condition badges, river stats, region info | Clean, scannable, data-rich |
| 3 | **River Detail** | MapLibre GL map, access point strip (horizontal scroll), gauge overview (collapsible), float plan builder | Interactive, map-centric, functional |
| 4 | **Access Point Detail** | Image carousel, amenities grid, road access info, nav app buttons (4-col), expandable sections | Detailed, practical, structured |
| 5 | **Gauges Dashboard** | Filterable/searchable card grid, slide-over drawer (desktop) / bottom sheet (mobile), flow trend charts, condition badges | Data-dense, dashboard-like, responsive |
| 6 | **Float Plan Viewer** | Shareable trip card, route map, stats (distance, time, conditions), vessel type | Focused, shareable, celebratory |
| 7 | **Chat (Ask Eddy)** | FAB trigger, chat panel (desktop: 400×600 corner; mobile: full-screen sheet), message bubbles, Eddy branding | Conversational, friendly, contextual |
| 8 | **Blog** | 3-column content grid, category badges, featured images, article detail with rich text | Editorial, clean, readable |
| 9 | **About** | Collapsible accordion sections, data source attribution, condition code legend | Informational, trustworthy, comprehensive |
| 10 | **Embed Showcase** | Widget preview cards (4 types), copy-paste code blocks, platform instructions tabs | Developer-friendly, interactive demos |

---

💡 **Usage Tip:** When calling `generate_screen_from_text` or `edit_screens`, include the tokens from this document in your prompt's `DESIGN SYSTEM (REQUIRED)` block to ensure visual consistency across all generated screens.
