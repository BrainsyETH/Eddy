# Daily dam videos

Open **Admin → Social → Create post → Dam generation** and choose a powerhouse.
SWPA projects offer today’s and tomorrow’s hourly generation schedules. Wolf Creek,
Center Hill and Dale Hollow offer the Corps’ generation forecast for the selected
Central date. Bagnell shows Ameren’s latest measured release and the previous
23 hourly readings. Total release includes all outlets.

Choose Instagram Story, TikTok, or both, then select **Create video**. In the Queue, owners open **Review draft** for each finished
video and choose **Approve & send** or **Schedule for later**. Timed approvals appear in the planner and can be returned to review from the queue. The publisher checks the source again at send time. Instagram publishes a Story. TikTok follows
the connected account’s posting mode: inbox drafts are finished in TikTok;
direct posting sends to the profile. **Download MP4** also works after delivery.
Rendering and downloading work without a connected social account.

This adds no public dam-page or iOS UI and does not schedule automatic posting.
The daily workflow is one checked, dated export per chosen destination. A failed
render should be regenerated from the form, which checks the source again.

## Data and presentation

- The picker follows the powerhouse registry. Videos carry the selected dam’s name, link and source.
- SWPA videos require a complete 24-hour schedule. Missing, invalid, future-dated check times,
  or checks older than the shared 90-minute threshold block export. A missing
  date never borrows yesterday's schedule. Confirmed zero generation is valid.
- Every scheduled generation window stays visible throughout the 12-second clip. The
  timeline shows each hour’s posted megawatts on the same fixed capacity scale
  as the dam widget. A diagonal shine follows the generating bars. Idle and
  minimum-flow hours stay at the baseline.
- Date, Central time, SWPA attribution and the source-check timestamp are burned
  into each SWPA video. No countdown, live cursor, seasonal pool line,
  or downstream arrival estimate. The animation uses a fixed illustrative
  water level. No scheduled generation stops the
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
`social-dam-schedule` render request. The callback leaves the video in review.
Each owner-initiated send rechecks the saved dam, source, date and destination.
Revised forecast windows or a new Ameren reading require a fresh video.
Earlier drafts without an explicit dam identity are checked against Table Rock. A revised hourly MW
value, changed chart scale, or older on/off-only draft requires a new video.
Background retries skip dam videos. Downloads require
owner access and proxy only a saved
Vercel Blob `social-videos/` output. No migration or new environment variable.

Static exports cannot update after posting. Check the burned-in date and source
time before sharing; regenerate if the source has changed. Download history is
retained for review, including older dated videos.

## Verification

`make check-web` covers the date, freshness, completeness, hour-ending,
minimum-flow and publish guards. The **Dam Story Preview** workflow typechecks
Remotion, checks both destinations in Chromium at six frames (including the
paddle's pull and recovery), and uploads preview stills plus two sample MP4s and an
isolated `dam-story-motion-study` MP4. Cases include midnight, all-day,
zero/minimum-flow, split windows and the maximum 12 separate windows. Checks also
cover the compact time card and Eddy’s canoe staying on the lake surface.
Motion tests compare the rendered scene across the loop seam, check continuous
hand movement and verify that the hull follows the same wave as the lake.
