# River UI correction

Requested behavior:
- Every Today alert is hidden for the selected snooze duration, including dangerous conditions. There is no replacement snooze-status card.
- The river and gauge charts use the pre-1297 design, including curated condition bands. No Usual flow switch, Expand chart button, or added instructional copy.
- Outages are identified in original telemetry before extrema sampling. Both chart clients consume those flags so sampling does not create artificial gaps; real outages remain gaps. Old cached payloads retain the existing cadence heuristic until refreshed.
- Local weather uses an Apple Weather-inspired visual hierarchy: sky background, current temperature, condition icon, actual three-hour forecast, grouped daily range bars, wind and humidity. Only the available five-day forecast is shown. No fabricated hourly values.
- Eddy’s Read uses river photography as a full background with a readable dark overlay and white text. Photo selection no longer depends on the Favorites route list. The four newly sourced photos have in-app credits and source/license links.

Validation includes web/mobile typechecks, web/mobile lint, chart continuity/crest/outage tests, a production iOS bundle and the EAS allowlist check. Browser screenshot rendering is blocked in this environment, so this remains a draft for device-level visual review, including photo loading and crops, large text, and weather transitions. Technical checks are not visual approval.

No long-route estimate changes, production database writes, or deployment.
