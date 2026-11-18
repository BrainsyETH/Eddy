# Daily dam schedule videos

The Table Rock pilot lives in **Admin → Social → Quick Post → Dam schedule video**.
Choose today or tomorrow (Central time), Instagram Story and/or TikTok, then
Create video. History shows each render separately. Preview the finished
video, optionally enable the safe-area guide, and Download MP4. Upload manually
in the destination app. No social connection is needed to generate an export.

This adds no public dam-page or iOS UI and does not schedule automatic posting.
The daily workflow is one checked, dated export per chosen destination. A failed
render should be regenerated from the form, which checks the source again.

## Data and presentation

- Existing dam snapshot reader and SWPA hour-ending semantics; no new ingestion.
- Complete 24-hour schedule required. Missing, invalid, future-dated check times,
  or checks older than the shared 90-minute threshold block export. A missing
  date never borrows yesterday's schedule. Confirmed zero generation is valid.
- Every generation window stays visible throughout the 12-second clip. The
  timeline shows all 24 posted hours, with a diagonal shine over scheduled hours.
  Minimum flow is not counted as generation.
- Date, Central time, SWPA attribution and the source-check timestamp are burned
  into the video. No countdown, live cursor, measured cfs, seasonal pool line,
  or downstream arrival estimate. The animation is labelled “not live”; it
  uses a fixed illustrative water level. No scheduled generation stops the
  decorative turbine, without claiming that the river is dry or safe.
- Time labels use the shared window formatter’s compact style (Noon/Midnight).
  Minimum-flow-only days use the shared “Only minimum flow scheduled” label;
  zero generation does not render a misleading “0 hours posted” count.
- The time card sizes to its content. The illustration takes the remaining room
  and the footer sits at the bottom of the safe area. Platform-control margins
  remain clear. Eddy is drawn in the scene's style as layered vector artwork:
  his seated body sits behind the canoe's front rim, hands follow the paddle,
  and the blade lifts out of the water during recovery.
- Shared Eddy fonts, palette and per-platform safe insets. Instagram uses the
  Story bounds; TikTok leaves space for its action rail. The schedule text and
  times hold still. The canoe follows the lake surface at bow and
  stern; paddle ripples follow water contact. Flow highlights follow one curved
  path through the pipe into the river. Every motion completes whole cycles in
  12 seconds, including the continuous dash patterns and turbine rotation.
- Default Remotion props are visibly marked sample data. Real exports set
  `sample: false`. The CI preview always renders labelled fixtures.

## Operations

Reuses `render-social-video.yml` and its existing renderer credentials and
callback. `GH_ACTIONS_REF` must include `social-dam-schedule` before using the
admin control (normally after merge to main). Existing production audio
normalization adds the social music bed; the preview fixture is silent and all
information remains readable without audio.

Drafts use the existing `manual` post type with `auto_publish: false` and a saved
`social-dam-schedule` render request. Both callback and generic publishing/retry
paths enforce download-only behavior; an Instagram Story cannot accidentally
be published as a Reel. Downloads require admin auth and proxy only a saved
Vercel Blob `social-videos/` output. No migration or new environment variable.

Static exports cannot update after posting. Check the burned-in date and source
time before sharing; regenerate if the source has changed. Download history is
retained for review, including older dated videos.

## Verification

`make check-web` covers the date, freshness, completeness, hour-ending,
minimum-flow and publish guards. The **Dam Story Preview** workflow typechecks
Remotion, checks both destinations in Chromium at six frames (including the
paddle's pull and recovery), and uploads 20 stills plus two sample MP4s and an
isolated `dam-story-motion-study` MP4. Cases include midnight, all-day,
zero/minimum-flow, split windows and the maximum 12 separate windows. Checks also
cover the compact time card and Eddy’s canoe staying on the lake surface.
Motion tests compare the rendered scene across the loop seam, check continuous
hand movement and verify that the hull follows the same wave as the lake.
