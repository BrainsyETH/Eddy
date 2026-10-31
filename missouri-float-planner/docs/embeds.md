# Embeds — the widget family

What a partner site, blog or newsletter can put on its own page, and how it is
built. The configurator at `/embed` (`src/components/embed/EmbedWorkbench.tsx`)
is the public face; this is the map for whoever changes it.

## Who embeds, and what they get

| Audience | Question on their page | Widget |
| --- | --- | --- |
| Outfitters, canoe rentals | Can my customers float this weekend, and book | River **card** / **full**, Float Trip Planner, Floatable From Here |
| Campgrounds, cabins, short-term rentals | Is it floatable from here | Floatable From Here card, river **card** |
| Bloggers, local news, river-guide posts | A live status inside prose | River **badge** or **strip**; the **image** render where iframes are stripped |
| Fly shops, trout guides, marinas, lake resorts | Is the dam generating, how much, when does it stop | Dam **card** / **full**, dam **strip** in a sidebar |
| Tourism boards, chambers, paddling clubs | Several rivers at once | Multi-river overview (a stack of strips) |
| Newsletters | A live condition in an email | **badge.png** / **strip.png** |

## The family

One widget per kind (`river`, `dam`), four sizes. Every size leads with the
same two facts: the live condition from `shared/condition-system.ts`, and the
reading **in the unit the river is rated in** (`ratedReading` in
`src/lib/embed/options.ts`). The other unit rides on the gauge line as
context. One Eddy illustration, one condition badge, one observation time, one
call to action.

| Size | Shows | Height |
| --- | --- | --- |
| `badge` | Inline pill: name, condition dot and label. Hugged by the host iframe. | ~40px |
| `strip` | One line: condition, rated reading, trend arrow, age. | ~64px |
| `card` | River name + condition → gauge location → reading + plain trend → the ladder (`RangeMeter`) → Eddy's take → one weather line → "Full report" and credit. | ~300px |
| `full` | Card + high/low weather, the trend chart, and other gauges as flat rows. | ~550px |

Dam sizes mirror the iOS "Dam generation" Home Screen widget, read off
`shared/dam-widget.ts` — the same packet the phone draws, so a bar cannot
disagree between the two. The card reads: dam and lake → turbine flow with
the generation status (stated once) → the next scheduled change → today's 24
hour-ending bars → footer. A schedule Eddy checked more than 90 minutes ago
replaces the next-change line with a visible coral note. Megawatts, sources,
the check time and the Central-time note sit in one "About this data"
disclosure (a popover would clip at the iframe edge; a disclosure expands and
the iframe resizes). `full` adds aligned rows for the tailwater status, total
release and lake level, and tomorrow's bars. "Turbine flow" stays the label —
"release" would blur it with total release.
Flood-control projects (no powerhouse) render an explanatory unavailable state;
the workbench picker excludes them, as the iOS picker does.

### URLs

```
/embed/river/<slug>?size=badge|strip|card|full
/embed/dam/<damId>?size=…
/embed/rivers?rivers=current,jacks-fork
```

Style parameters, shared by both kinds (parsed by `parseEmbedOptions`):

| Param | Values | Effect |
| --- | --- | --- |
| `theme` | `light` / `dark` / `auto` | `auto` follows `prefers-color-scheme` via one media query; the frame emits CSS custom properties (`--ew-*`), components never branch on theme. |
| `bg` | `transparent` | Drops the whole frame (surface, border, shadow) so the widget sits on the host's own surface. |
| `accent` | `#rrggbb` | Recolors links and actions only (`--ew-link`, `--ew-accent`). Condition colors and data ink (`--ew-data`: generation status, schedule bars, the trend line) never change; `embed-options.test.ts` guards this. |
| `days` | `7` / `14` / `30` | Chart window on the full river size. |
| `partner` | text | Footer text credit. |
| `e` | `emb_xxxxxxxx` | Registered co-branding (logo, name, backlink) — `src/lib/embed/cards.ts`. |

Legacy routes keep working as fixed sizes, so no pasted iframe changes shape:
`/embed/widget/` → full, `/embed/eddy-quote/` → card, `/embed/gauge-report/` →
full (with `days`), `/embed/badge/` → badge. `embed-options.test.ts` pins this.

### Images

```
/embed/img/<river|dam>/<key>/<badge|strip>.<png|svg>?theme=light|dark&bg=transparent&accent=…
```

For Substack, Medium, Ghost, GitHub READMEs and email. PNG is drawn by Satori
with Fredoka + Geist Mono embedded (the OG-image font pipeline); SVG is hand
built with `textLength`-pinned runs so a fallback font cannot overflow. Both
share `src/lib/embed/image-model.ts`. Cached five minutes at the CDN.

### Script loader

```html
<script async src="https://eddy.guide/embed.js"></script>
<div data-eddy-river="current" data-size="card" data-theme="auto"></div>
<div data-eddy-dam="swl-bull-shoals-dam" data-size="strip"></div>
```

`public/embed.js` builds the iframe and sizes it from the widget's
`eddy-embed:resize` message. It shares the `__eddyEmbedResizer` guard with the
older inline snippet, so both can coexist on one page. `loader.test.ts` runs it
against a fake DOM.

## How it renders

Server components, no client fetch waterfall:

- `src/lib/embed/river-data.ts` — one assembly per (river, chart window),
  `unstable_cache` 120 s: river from `pageRivers`, ladders + newest readings
  from `river_gauges` / `loadCurrentReadings`, trend via `computeTrend` over
  stored history (oldest-first; `widget-trend.test.ts` guards the direction),
  Eddy's take via `src/lib/eddy/latest-update.ts` (the same safety-gated read
  the API route serves), weather from OpenWeather.
- `src/lib/embed/dam-data.ts` — the stored hourly snapshot, re-banded against
  the request clock, registry-checked for a powerhouse.
- `src/components/embed/v2/` — `EmbedFrame` (theme tokens), `RiverEmbed`,
  `DamEmbed`, `RangeMeter`, `EmbedCredit`, `EmbedBrandMark` (the only client
  piece besides the chart: partner-logo fallback).
- Styles live in `globals.css` under `.ew-*` and reference `--ew-*` tokens
  only. Condition colors arrive inline from the canonical system; in a dark
  frame each chip swaps to its condition's chip-border tone.

### Visual rules

- **Frame**: the site's `.card-framed` — surface, 2px primary-700 border, 8px
  corners, the 3px hard `--shadow-md`. The frame sits in a 3px gutter inside the
  iframe because the host sizes the iframe from scroll height, which ignores
  box-shadow. Inside the card: spacing and hairline separators, no nested boxes.
- **Type**: titles in the heading face at 18px and allowed to wrap (below
  380px the condition badge drops under the name); 14px body; 12px for
  everything supporting; nothing smaller. Fredoka stays for Eddy's own brand
  moments, not data. Figures use tabular numerals in the body face.
- **Chart**: a fixed-height SVG stretched to the width with non-scaling
  strokes; tick labels and dots are HTML, so they stay 12px at any width.
- **Credit**: "Powered by Eddy" carries Eddy's mark only when a partner logo
  has taken the header, so every card has exactly one Eddy illustration.

The planner, services directory and the location-pinned card are unchanged
single-purpose embeds (`EmbedFooter`, `EmbedHeaderLogo`, `useEmbedBranding`).

## Workbench

`/embed` runs widget → river or dam → size → appearance, with the placement
shortcuts (sidebar, in a post, landing page, email, regional page) as an
optional "Quick start". On phones the preview sits between the size choice and
the appearance options. Copy code is the main action; URL parameters are under
"Advanced", installation steps under the Help tab.

## Measurement

Every load beacons one impression (`EmbedImpression`) to
`/api/embed/impression`, aggregated daily per (type, key, host). Family routes
send the size in the type (`river-card`, `dam-strip`); image renders send
`river-badge-image` etc., counted per origin fetch (CDN hits are not seen).
The admin dashboard's "Which sites show Eddy widgets?" card answers how many
outside websites embed a widget: distinct external hosts with at least one
load in the last 30 days, which ones are new this week, and which went quiet
(`embedSites` in `src/lib/admin/dashboard/widget-model.ts`). Eddy's own pages,
loads with no referrer, and shared-link hosts (social, search, webmail) are
kept out of that count and listed separately. Its detail view also breaks
outside loads down by widget type and river. Read it before cutting a size.
The dashboard holds 30 days of daily rows, so "new" means first seen within
that window.
