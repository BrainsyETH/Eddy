# Social post review workflow

Manual generation now creates a draft. Video drafts move from `rendering` to
`review` after the audio-verified callback; image tips start in `review`.
Inspect the media and full caption in posting history, then publish the approved
draft. Scheduled posts retain automatic publication. `inbox` means TikTok still
requires completion in its app; it does not mean publicly published.

Retry delivery uses the saved media type, URL and caption. Render again uses the
saved composition and returns to review. Older failed renders without a saved
composition require a new draft. Generating another manual post preserves history.
Concurrent approval requests claim the row before contacting the platform.

## Editorial changes

- Reports keep absent gauge readings unavailable and show the reading timestamp
  when present. Prepared time is explicitly distinguished from reading time.
- Digests paginate at five rivers per eight-second page and shorten the opening
  quote. The duration metadata includes every page.
- Weekend picks require the actual upcoming Saturday/Sunday forecast coverage
  (Sunday alone when posted Sunday). Missing weather is unknown, never dry.
  Captions distinguish current water conditions from weekend weather.
- Float Picks distinguish today's selection from evergreen Trip Ideas; caption
  links retain the selected endpoints. Float-time ranges are in separate PR #1298.
- Trends require coverage near both ends of the week and a reading within six
  hours. Charts preserve acquisition gaps; falling water is not called safer.
- Schedule previews offer Due now and Today's schedule, complete captions, and
  covers. Their caption/cover assembly uses the same context builder as dispatch.
- Post review includes the shared Reel safe-area guide and actual asset crops at 9:16, 3:4, 4:5 and square. Mobile review stacks the reel and cover vertically. Instagram uses the custom cover; Facebook/TikTok previews identify the video-frame behavior and distinguish stored reference art. TikTok direct-post preview starts at the requested 0.5-second frame; inspecting a different frame does not change publishing settings.

## Deployment and validation

Apply `20260916140000_social_review_workflow.sql` before deploying this code.
It adds review/inbox states, `auto_publish` and saved render inputs, and narrows
the digest uniqueness rule to automatic posts. It is recorded as pending; no
production migration has been applied by this change.

Local verification: web and Remotion type checks, ESLint, token checks and the
registered test suites. The six new regression cases cover pagination, short
summaries, condition-aware trend text, graph gaps, video retry media and weekend
coverage. Chromium is unavailable in this workspace, so rendered visual QA and
live platform delivery remain release checks. Inspect long names, five-row
pages, missing readings/weather, the route CTA and each platform's actual crop.
The app needs a live database and platform credentials for an end-to-end review
and delivery smoke test.

## Cover and reel formatting follow-up

The five editorial portrait cover formats keep their content in the central square
intersection, preserving the title and branding in the supported centered crop
previews. Covers omit lengthy report excerpts and repeated instrument stats;
the digest cover shows three sample rivers and points to the complete reel.
Today’s Float Pick / Trip Idea labels are shared across captions, covers and
reels. Headings have more reserved space, longer names use smaller title type,
river names wrap, and weather text is larger.

A local Satori/ImageResponse fixture with long route endpoint names rendered
successfully and was visually inspected. This checks static cover primitives;
it does not replace live-photo, all-template, or animated-video QA. A regression
test checks central cover bounds against all four crop ratios.
