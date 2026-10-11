# Visual explainers

Self-contained HTML pages that show how Eddy works. Each file opens straight
from disk in a browser: fonts and images are embedded, nothing is fetched,
nothing here is built or shipped. They are reference material, not product code.

| Page | What it shows | Audience |
| --- | --- | --- |
| [`watershed.html`](watershed.html) | The whole system as a watershed: sources → Vercel Cron → Supabase → the condition ladder → web, iOS, alerts, social, MCP. Simulated gauge passes and a "send a storm" button. | Team |
| [`social-delta.html`](social-delta.html) | Continues the watershed downstream of Social: post scheduler, condition alerts, ClipEngine, captions, renders, brand checks, the feeds, and insights flowing back. | Team |
| [`eddys-day.html`](eddys-day.html) | A 24-hour dial of every scheduled job, plotted from `missouri-float-planner/vercel.json`. | Team |
| [`condition-ladder.html`](condition-ladder.html) | A hands-on port of `classifyReading` (`shared/condition-ladder.ts`): flood-stage override, cross-unit fallback, `strictUnit`. | Team |
| [`how-eddys-read-works.html`](how-eddys-read-works.html) | The daily Eddy's Read pipeline: facts, context, preflight, the model's three blocks, the contradiction guard, and the live re-check, in four scenarios. | Team |
| [`ios-plumbing.html`](ios-plumbing.html) | The iOS app's plumbing: API client, offline bundle and river cache, Keychain, RevenueCat, push, Mapbox, and shared packages, with a lose-signal switch. | Team |
| [`ios-tour.html`](ios-tour.html) | A clickable iPhone running the five tabs on the app's own theme, with notes on what each part does and where its data comes from. | Team, product |
| [`float-board.html`](float-board.html) | Prototype paddler view: real access points by river mile, a what-if water level, and a canoe floating the stretch. | Product |
| [`below-the-dam.html`](below-the-dam.html) | Why Eddy gives no float time below a hydropower dam, played through a day. | Paddlers, product |

## What is real and what is not

The structure, route names, cadences, rules, copy and theme come from the code
and docs named in each page's footer. Readings, timings, posts, alert rules and
example rivers are simulated or illustrative, and each page says which. The
schedules in `eddys-day.html` and the classifier in `condition-ladder.html` are
copied from source, so they drift if the source changes: re-check them before
quoting either.

## Exploring the pages

Use **Explore Eddy** at the top of any page to move through the collection.
All navigation stays within this folder. On a phone, the three system maps
open as a step picker with the same selectable components; **Show full diagram**
opens the complete map. The selected explanation sits immediately below it.

Animations start paused. Use Play, the time sliders, or Next to move through an
example. The Float Board has its own pause control. Reduced-motion preferences
remove decorative animation. The iPhone tour supports arrow-key tab navigation
and shows marker explanations in a dismissible panel on small screens.

Examples are labeled before the controls. They do not make API requests, send
alerts, purchase Premium, or publish posts. Technical source notes are available
in expandable sections. The iPhone screens are illustrative, not a complete
inventory of the current app or proof of a released feature.

## Editing

These are generated files. The sources and build scripts were scratch work and
are not kept here; edit the HTML directly, or rebuild from the referenced
source files. Keep everything inline (no external requests), and keep the
"simulated" labels honest when the code they describe changes.

None of this is reachable from the website or the app: `docs/` is outside
Vercel's root directory, and `.easignore` admits only what the iOS bundle needs.

## Checking an edit

Open each changed HTML file directly from disk. Check narrow phones (320 and
390 px), desktop, light and dark appearances, and reduced motion. There should
be no page-wide horizontal overflow or external font/image requests. For maps,
check every section and node in the mobile picker and in the full diagram.

Exercise the controls relevant to the page: all condition presets, all four
Read scenarios through the final step, each river and water level on the Float
Board, time and launch choices below the dam, schedule day/time-zone choices,
online/offline app scenarios, and all five phone tabs and numbered markers.
The product's build checks do not exercise these standalone reference pages.
