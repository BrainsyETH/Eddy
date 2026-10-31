# Visual explainers

Interactive guides to how Eddy works, available after signing in at
`/admin` → **Visual guides** (`/admin/visuals`). Each guide opens as a full-page
document, with links back to the collection and the admin dashboard.

The canonical HTML files live in `missouri-float-planner/content/admin-visuals/`.
Fonts and images are embedded, so the files also open directly from disk.

| Page | What it shows | Audience |
| --- | --- | --- |
| [`watershed.html`](../../missouri-float-planner/content/admin-visuals/watershed.html) | The whole system as a watershed: sources → Vercel Cron → Supabase → the condition ladder → web, iOS, alerts, social, MCP. Simulated gauge passes and a "send a storm" button. | Team |
| [`social-delta.html`](../../missouri-float-planner/content/admin-visuals/social-delta.html) | Continues the watershed downstream of Social: post scheduler, condition alerts, ClipEngine, captions, renders, brand checks, the feeds, and insights flowing back. | Team |
| [`eddys-day.html`](../../missouri-float-planner/content/admin-visuals/eddys-day.html) | A 24-hour dial of every scheduled job, plotted from `missouri-float-planner/vercel.json`. | Team |
| [`condition-ladder.html`](../../missouri-float-planner/content/admin-visuals/condition-ladder.html) | A hands-on port of `classifyReading` (`shared/condition-ladder.ts`): flood-stage override, cross-unit fallback, `strictUnit`. | Team |
| [`how-eddys-read-works.html`](../../missouri-float-planner/content/admin-visuals/how-eddys-read-works.html) | The daily Eddy's Read pipeline: facts, context, preflight, the model's three blocks, the contradiction guard, and the live re-check, in four scenarios. | Team |
| [`ios-plumbing.html`](../../missouri-float-planner/content/admin-visuals/ios-plumbing.html) | The iOS app's plumbing: API client, offline bundle and river cache, Keychain, RevenueCat, push, Mapbox, and shared packages, with a lose-signal switch. | Team |
| [`ios-tour.html`](../../missouri-float-planner/content/admin-visuals/ios-tour.html) | A clickable iPhone running the five tabs on the app's own theme, with notes on what each part does and where its data comes from. | Team, product |
| [`float-board.html`](../../missouri-float-planner/content/admin-visuals/float-board.html) | Prototype paddler view: real access points by river mile, a what-if water level, and a canoe floating the stretch. | Product |
| [`below-the-dam.html`](../../missouri-float-planner/content/admin-visuals/below-the-dam.html) | Why Eddy gives no float time below a hydropower dam, played through a day. | Paddlers, product |

## What is real and what is not

The structure, route names, cadences, rules, copy and theme come from the code
and docs named in each page's footer. Readings, timings, posts, alert rules and
example rivers are simulated or illustrative, and each page says which. The
schedules in `eddys-day.html` and the classifier in `condition-ladder.html` are
copied from source, so they drift if the source changes: re-check them before
quoting either.

## Exploring the pages

Use the **Visual guides** picker at the top of any page to move through the collection.
The gallery groups guides into On the river, Using Eddy, and Behind the scenes.
Start with river conditions; each guide also links to the next example.
All navigation stays within this folder. On a phone, the three system maps
open as a step picker with the same selectable components; **Show full diagram**
opens the complete map. The selected explanation stays beside the picker on
desktop and immediately below it on phones. Desktop also shows the full diagram.

Animations start paused. Use Play, the time sliders, or Next to move through an
example. The Float Board has its own pause control. Reduced-motion preferences
remove decorative animation. The iPhone tour supports arrow-key tab navigation
and shows marker explanations in a dismissible panel on small screens.

Examples are labeled before the controls. They do not make API requests, send
alerts, purchase Premium, or publish posts. Technical source notes are available
in expandable sections. The iPhone screens are illustrative, not a complete
inventory of the current app or proof of a released feature.

## Editing

Edit each demo’s markup and behavior directly in its HTML file. The original
scratch generators are not retained. Shared collection chrome is now generated:

- `src/lib/admin/visual-guides.ts` owns groups, titles, instructions, order, and the server allowlist.
- `content/admin-visuals/shared.css` owns shared styling, including neutral dark surfaces.
- `npm run build:visual-guides` inlines styling, navigation, introductions, and next-guide links into every HTML file.
- `npm run check:visual-guides` checks for generated-content drift without writing files.

Keep assets inline and example labels honest. The iPhone tour follows Today,
Map, Floats, Favorites, Alerts; Settings is reached from the account button.
The daily schedule offers explicit CDT, CST, and UTC examples. Changing its
weekday or timezone refreshes the jobs shown at the selected minute.

The condition guide places app/alert results beside the slider and keeps
missing-data controls optional. Float planning puts route choices and time
results together before the map. Changing the launch below a dam pauses the
demo at that launch time. Every online/offline action has a visible outcome;
the sample phone starts with saved river data, and cached lines are distinguished
from downloaded background tiles. Read scenarios retain all seven steps with
a compact selector on phones.

## Admin access and deployment

The gallery uses the existing admin sign-in. Each document at
`/admin/visuals/<filename>.html` validates the signed admin session on the server
before reading its file. Missing, invalid, and expired sessions return to the
gallery's sign-in screen. Only catalogued filenames are served, and responses
use `private, no-store` and `noindex, nofollow`.

Keep the HTML in `content/admin-visuals/`, never `public/`. The route-specific
`outputFileTracingIncludes` in `next.config.mjs` packages the files for Vercel.
The route adds admin navigation. Its policy in `next.config.mjs` permits
inline interactions and embedded assets while blocking external requests.
The iOS bundle does not include these guides.

When adding a guide, register it in `src/lib/admin/visual-guides.ts` and
run `npm run build:visual-guides`. The catalog is also the server’s
filename allowlist.

## Checking an edit

Open each changed HTML file directly from disk. Check narrow phones (320 and
390 px), desktop, light and dark appearances, and reduced motion. There should
be no page-wide horizontal overflow or external font/image requests. For maps,
check every section and node in the mobile picker and in the full diagram.

Exercise the controls relevant to the page: all condition presets, all four
Read scenarios through the final step, each river and water level on the Float
Board, time and launch choices below the dam, schedule day/time-zone choices,
online/offline app scenarios, and all five phone tabs and numbered markers.
Run `make check-web` for the gallery and access-control tests. Also check the
signed-in routes in a browser: embedded fonts, collection links, and the return
to admin navigation must work with the response security headers. Try a direct
diagram URL after signing out; it must return to sign-in without serving HTML.
Run `npm run test:visual-guides` after `npx playwright install chromium` for
browser checks across all nine guides. They cover the scenarios above, light
and dark appearances, 320/390/1280px layouts, reduced motion, runtime errors,
and unexpected network requests. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can
point to an existing Chromium installation. Gallery/route tests also check
catalog assets, the native tab order, and the deployed cron catalog.

These checks supplement visual inspection; they do not replace testing the
signed-in page under its deployed security policy or testing real native iOS
behavior. The guides themselves are web simulations.
