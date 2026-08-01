# Eddy iOS UX redesign implementation plan

## Summary

Implement the selected improvements from `Eddy iOS UX redesign.pdf` while preserving Eddy's safety language, condition system, free planner, paywall boundary, and permission discipline.

Implementation should start from the latest `origin/main`. The existing dirty `agent/ios-teal-interactions` worktree must remain untouched, and its six uncommitted multi-provider search changes should be ported carefully before editing overlapping Search and shared-types code.

## 1A - Today

- Rename the visible Search tab and screen title to **Today** while retaining the internal `reports` route.
- Default to the Rivers scope while keeping the compact five-scope control permanently visible.
- Restore the headline: "N of M rivers are floatable now," followed by the existing gauge-lag caveat.
- Replace the bare sort glyph with a labeled control showing the active order.
- On location denial, provide an **Open Settings** action; retain the straight-line-to-gauge explanation for successful Near Me sorting.
- Move the hand-researched/request-a-river message to the end of the Rivers list.

## 1B - Map

- Keep the existing failure-only live-readings notice; do not add cached condition colors or a persistent freshness timestamp.
- Keep all nine layers in the current switch-based sheet; do not restore permanent layer chips.
- Add a compact, collapsible condition legend over the map without competing with Mapbox attribution or bottom controls.
- Increase supporting map chrome and callout text to at least 13-14pt with stronger outdoor contrast.
- Add direct Apple Maps directions to access-point callouts.
- Preserve the existing **Use as put-in/take-out** planner seeding and private-access confirmation.
- When an access point has a detail slug, lazily fetch its existing detail response after selection and show `gaugeStatus` only when returned. Never approximate point-level water from a river-wide or nearest-gauge value.

## 1C - Alerts

- Add live count badges to **Mine**, **Running high**, and **Agency notices**.
- Remove the redundant Mine caption; retain concise authority/safety notes where they distinguish Eddy's grades from agency notices.
- Remove the empty-state floating Add Alert button; keep the header `+`.
- Add a signed-in Quiet Hours summary row at the top of Mine, refreshed when the tab regains focus and linked to the existing settings screen.
- Show "Last sent ..." from `lastTriggeredAt` on standing alert rules while retaining the special spent one-shot copy.
- Add **Rivers you follow** to Mine using the existing local star store:
  - Rivers without a rule show **Watch**.
  - Watch creates the existing safety-only high/dangerous subscription.
  - Watched rivers show **Watching** and link to their existing rule.
- Extract the existing sign-in, subscription, refresh, and push-primer behavior into reusable Watch logic shared by Alerts, river detail, and finished plans.

## 1D - First run

- Keep the current legal/safety screen first, verbatim and unskippable.
- Store legal acceptance separately from personalization completion.
- Show one skippable personalization pane only for genuinely new installations:
  - Existing users who already accepted terms are migrated directly into the app.
  - New users see six live condition cards: Current, Jacks Fork, Meramec, Big Piney, Huzzah, and Eleven Point, filling missing entries from the floatable-first list.
  - **See all rivers** expands to searchable access to the full curated catalog.
  - An explicit **Show rivers near me** action requests location and reorders by distance to each primary gauge; the pane never prompts automatically.
  - Follow commits selected rivers as local-first stars. **Not now** records completion without adding stars.
- Add an idempotent bulk/set-star operation to the star context so onboarding cannot toggle off an already-synced river.
- If river or location loading fails, keep the picker usable where possible and never block **Not now**.
- Do not add a push-permission pane or create alerts automatically.

## 1E - Plan a float

- Restyle completed breadcrumb steps as tappable bordered chips with checkmarks; preserve the current ability to revisit any reachable step.
- Add a non-interactive SVG route preview using existing route geometry:
  - Normalize the LineString into the preview bounds.
  - Draw the exact route and put-in/take-out markers.
  - Reuse it in both newly built and reopened saved plans.
  - Hide it when geometry is unavailable rather than drawing an invented route.
- Add an estimate basis line: vessel name plus today's condition/read state.
- Add a Daylight card for Today and Tomorrow:
  - Show river-local sunset and the latest put-in time that finishes by sunset using the conservative maximum float estimate.
  - If today's latest-start time has passed, state that there is insufficient daylight for the full stretch.
  - If no safe float-time estimate exists, show sunset only and omit a start recommendation.
  - Note that weather and shade can reduce usable light.
- Keep the existing shuttle route and nearby outfitter list; do not claim an outfitter serves a particular stretch without supporting data.
- Add a safety-only Watch action using the shared alert flow. Save, Share, and the planner remain free with no new paywall.

## Interfaces and data

- Add an optional `timezone` field to the shared River/plan payload for backward compatibility; populate it from the existing `rivers.timezone`, falling back to `America/Chicago`.
- Add pure, tested daylight calculations and route-preview normalization to a shared module suitable for the existing web test runner.
- Extend the star context with idempotent `setStarred`/bulk-add behavior.
- Reuse the existing access-point detail API for callout gauge status; introduce no new point-condition endpoint.
- No alert-server schema changes are required; existing rules, notification preferences, and subscription endpoints provide the needed data.

## Test plan

- Unit tests:
  - Floatable headline/count and river-first defaults.
  - Denied-location recovery and distance sorting.
  - Idempotent onboarding stars, legal/personalization migration, skip behavior, and interrupted onboarding.
  - Alert counts, selective captions, last-sent formatting, Watch deduplication, and safety-only subscription kind.
  - Solar calculations across today/tomorrow, DST boundaries, timezone fallback, passed start windows, and null float times.
  - SVG route normalization, reversed/degenerate geometry, and missing geometry.
- Integration checks:
  - Existing access detail gauge status appears asynchronously without blocking Directions or planner actions.
  - Watch sign-in and push primer behave consistently from Alerts, river detail, and plans.
  - Saved/shared plans render the same preview, daylight, assumptions, and safety content as newly built plans.
- Manual iPhone QA:
  - Small and large screens, light/dark mode, Dynamic Type, VoiceOver, sunlight contrast, keyboard transitions, offline/poor signal, denied location, signed-out state, and denied notifications.
  - Confirm every legal and safety string remains unchanged and Mapbox attribution stays visible.
- Run iOS typecheck/lint plus the web typecheck, full test suite, and production build checks.

## Assumptions and exclusions

- Daylight uses the compact Today/Tomorrow sunset-plus-latest-start design.
- No trip-date selector, statewide-reading cache, permanent map layer chips, new outfitter coverage model, automatic alert creation during onboarding, or paywall changes are included.
- The existing dirty iOS branch remains recoverable and unmodified throughout implementation.
