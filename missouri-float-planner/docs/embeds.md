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
`src/lib/embed/options.ts`). The other unit is context. One mascot, one
observation timestamp, one call to action.

| Size | Shows | Height |
| --- | --- | --- |
| `badge` | Inline pill: name, condition dot and label. Hugged by the host iframe. | ~40px |
| `strip` | One line: condition, rated reading, trend arrow, age. | ~64px |
| `card` | Header with the mood otter, reading on the ladder (`RangeMeter`), Eddy's take in full, weather, credit. | ~300px |
| `full` | Card + the shared trend chart + other gauges. | ~550px |

Dam sizes mirror the iOS "Dam generation" Home Screen widget: observed turbine
flow, the generation state, the next-change sentence and today's 24
hour-ending schedule bars, all read off `shared/dam-widget.ts` — the same
packet the phone draws, so a bar cannot disagree between the two. `full` adds
the tailwater status row, lake level, total release and tomorrow's schedule.
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
| `bg` | `transparent` | Drops the panel background so the widget sits on the host's own surface. |
| `accent` | `#rrggbb` | Recolors links and the CTA only. Condition colors never change. |
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
  only. Condition colors arrive inline from the canonical system.

The planner, services directory and the location-pinned card are unchanged
single-purpose embeds (`EmbedFooter`, `EmbedHeaderLogo`, `useEmbedBranding`).

## Measurement

Every load beacons one impression (`EmbedImpression`) to
`/api/embed/impression`, aggregated daily per (type, key, host). Family routes
send the size in the type (`river-card`, `dam-strip`); image renders send
`river-badge-image` etc., counted per origin fetch (CDN hits are not seen).
The admin dashboard's "AI & reach" section breaks the last 7/30 days down by
type, key and host (`src/lib/admin/dashboard/widgets.ts`). Read it before
cutting a size.
