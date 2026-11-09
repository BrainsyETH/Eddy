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
`shared/dam-widget.ts` — the same posted MW packet the phone draws, so an
hour cannot disagree between the two. The card reads: dam and lake → **observed**
turbine flow with one dated generation status → the **Central-time date**
and posted next-change sentence → taller 24-hour MW chart with an Eddy-coral
Now line → footer. The marker
is the current Central hour, not a claim that a scheduled bar was observed.
Missing hours have short outlined marks, not zero-generation bars; minimum
flow is separate from scheduled generation. Observations and posted plans may
disagree and must never be presented as a single live feed.

A schedule Eddy checked more than 90 minutes ago replaces the next-change
sentence with a visible coral notice. Sources, peak MW, the check time and
the Central-time explanation sit in "About this data"; the iframe resizes
when the disclosure expands. `full` adds the dam's own dated downstream
water elevation and only fresh, canonically rounded movement (no safety verdict; outdated elevation values are suppressed),
spillway discharge when separately observed, and total release only when
it isn't an effectively identical, near-simultaneous turbine observation.
Daily-average release stays distinct. The full embed shows **below the dam**,
**lake level**, and **water temperature below the dam** in a shared measurement
row when data exists. Use the existing web/iOS Eddy glyphs for river gauge,
lake gauge and water temperature, rather than generic iconography. Rising
stage (only when a fresh, measured change exists) uses a coral arrow + text;
falling stage uses teal arrow + text; lake level is rendered in Eddy water teal.
These are measurements, **not safety classifications**. All three metrics
stay on one row at every embed width; narrow frames use compact figures and
stack the existing branded icons above their labels instead of forcing
temperature onto a second row. Only available metrics are shown.

Today's chart does not repeat a "Posted generation schedule" or "Today's posted
generation · CT" heading. Its date appears once, where the schedule title
used to sit, above the next-change sentence; the chart retains an accessible
day/date label, its MW context, and the coral Now marker. Tomorrow retains
its own distinct date heading when the full embed includes it.

The full card has one visible `Observed … ago` line at the header's top-right,
referring **only to turbine flow**. It is not a single timestamp for all
measurements: exact ages for downstream stage, lake elevation, temperature,
spillway and other release readings stay in the expanded `About this data`
and on the metric's native hover title. Stale levels/temperatures have no
numeric reading presented as current. Tomorrow's posted bars remain.
Everything is flat within the Eddy frame, not nested metric tiles.
"Turbine flow" stays explicit: "release" could include spillway or other
outlets.
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
The admin dashboard's "Referring sites" card counts distinct outside hosts
that sent widget views in the last 30 days, which ones are new this week, and
which went quiet (`referringSites` in `src/lib/admin/dashboard/widget-model.ts`).
Eddy's own pages, loads with no referrer, and social, search and webmail hosts
are kept out of that count and listed separately; the detail view's widget and
river rankings use the same rows. Read it before cutting a size.

A referring site is not a confirmed embed. The beacon sends
`document.referrer`, which is the same whether the widget loaded in an iframe
on that site or someone clicked a widget link there. Confirming embeds needs
the beacon to record whether it loaded inside a frame. The dashboard holds 30
days of daily rows, so "new" means first seen within that window.

## Display contract

The full-screen displays — the [Missouri mills collection](missouri-mills.md)
and River Window at `/embed/display`, and the
[home-base board](home-base-board.md) at `/embed/board/<id>` — are framed by
wall hosts that rotate several displays on one screen (the Farmhouse
dashboard's `/display` playlist is the first). Each posts these messages to
its parent (`postMessage`, target `'*'`, nothing sent when not framed). The
types and the host-side validator are `src/lib/embed/display-events.ts`;
`isDisplayEvent` rejects any other version, so a breaking change means a new
`v`, not a reshaped message.

| Message | When | Payload |
| --- | --- | --- |
| `eddy-display:ready` | Once, after the display is drawn and its first readings request has settled, either way | `display` (`mills` / `river-window` / `board`), `format` (`landscape` / `vertical`) |
| `eddy-display:status` | Right after ready, then whenever it changes | `readings`: `current`, `interrupted` (refresh failed, last good readings still shown and aging) or `unavailable`; `scenery`: `ok` / `unavailable` |
| `eddy-display:break` | At each natural cut point | `completed` (breaks since load), `total` (breaks in one full loop), and `next` where the display can resume |

Cut points: **Mills** breaks as each painting ends, on the frame the veil
starts to fall (`MILL_BREAK_FRAME`), so `total` is the number of mills and
`next` is the mill that would follow. **The board** breaks once per loop, as
the hold on the present gives way to the first spotlight (`loopCompleted`).
River Window sends ready and status only. A paused display (`motion=off`,
reduced motion) sends no breaks; hosts fall back to their own timer.

URL parameters a host may rely on: `format=vertical|landscape` and
`rivers=` (Mills), `motion=off` (all), and `start=<mill id>` (Mills: opens on
that mill, so a host can pass back a break's `next` and resume the tour; an
unknown or filtered-out id opens on the first mill). These, and the message
types above, are the contract: `display-events.test.ts` fails if this section
stops naming them.
