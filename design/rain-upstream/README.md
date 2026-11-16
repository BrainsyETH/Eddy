# Rain upstream design preview

Open [Eddy-Rain-Upstream-Mockup.html](Eddy-Rain-Upstream-Mockup.html) after
downloading it. It is one self-contained HTML file; no server, build step,
external asset request, or Claude sign-in is needed.

Companion plan: [docs/noaa-rainfall-plan.md](../../docs/noaa-rainfall-plan.md).

## What to review

- iOS: compact river screen beside the expanded chart.
- Web: the existing report structure with Rain upstream opening the expanded
  chart. The prototype's illustrative desktop composition is not a screenshot
  or a proposal to change unrelated live report layout.
- Rain on / off: side-by-side chart views with the water plot in the same place.
- After rain, quiet, forecast-only, delayed, partial and unavailable states.
- Light/dark appearance, larger text, 24-hour / seven-day ranges, chart
  selection, rain details, keyboard selection and an accessible data table.

The compact Rain upstream entry explicitly opens the expanded chart; only the
expanded chart has a rain-layer switch. The water and rainfall scales are
separate. Turning rain off retains the chart slot so the river does not move.
The prototype shows rainfall forecasts in details; combined future rain bars
remain part of the implementation contract and require their own verification.

All readings, rain, forecasts and condition bands are illustrative. Sample data
is not evidence of real river response or safe floating conditions. No actual
watershed outline or rainfall raster is shown: source-validated map delivery
remains a phase-2 requirement. The private Claude canvas was not accessed.

## Brand provenance

The HTML embeds these existing repository assets unchanged:

- `missouri-float-planner/src/app/fonts/GeistVF.woff`
- `missouri-float-planner/src/app/fonts/GeistMonoVF.woff`
- `missouri-float-planner/src/app/fonts/Fredoka-SemiBold.ttf`
- `eddy-ios/assets/eddy/eddy-weather.png`
- `eddy-ios/assets/eddy/eddy-checking-gauge.png`
- `eddy-ios/assets/otter/standard.png`

Colors, neutral dark surfaces, type roles and native/web card treatments follow
`.stitch/DESIGN.md`, the native palette and README. The prototype is coded in
HTML/SVG to keep values and filters inspectable; it is not a generated picture.

## Verification record — 2026-11-11

Completed:

- JavaScript syntax check.
- Executed 72 template combinations (six data states × three layouts × two
  ranges × rain on/off) without undefined values or non-finite output.
- Checked sample 24-hour / six-hour sums and delayed observation sum.
- Checked missing data stays unavailable, forecast-only wording, detail/table
  generation, and separate on/off comparison markup.
- Parsed generated HTML and checked duplicate IDs in each layout.

**Browser rendering and real DOM interaction checks remain unverified.** The
workspace Chromium could not start because socket creation was prohibited;
the shared browser rejected local `file:` URLs. No screenshots or layout
measurement results are claimed. Native device verification was not attempted.

Before implementing the UI, open this HTML at 320/375/390 px and desktop,
check both text sizes and appearances, and compare the compact river screen
against a current app/web baseline. No-shift behavior is a design requirement,
not yet a verified statement about the production screens.

This directory contains design material only. No production changes or feature
release are made by adding it.
