# Fall camping campaign — production handoff

Status: approved script and voice preparation ready; narration and final video
have not been generated or approved. Real app captures and opening/closing
footage are outstanding. Nothing in this directory publishes content.

## Creative direction

Conversational creator: a friendly paddler explaining a useful app. Camping
is the story; river conditions and weather support the weekend decision.
Use the revised scripts in `campaign.json` (`scenes` for long, `shortScenes` for short). Every scene has its spoken
text, intended screen action and requested asset filename. Generate one
continuous narration take so the delivery retains natural phrasing.

Start with Marin, using the existing Eddy Read model snapshot but distinct
campaign delivery instructions. Review the dry voice before adding music.
Prepare separate long and short edits for testing on both platforms. The short
cut targets about 20–25 seconds at the brisk delivery. Shorten wording when
needed; never speed up the long narration to fit. Audition relaxed (145–155 wpm)
and brisk (160–175 wpm) deliveries. Pace warnings are listening prompts, not
automatic rejections. The measured recording determines the final edit.

## Opening and concrete result

Use Evan's exact hook: "You can't just show up and camp on the Current anymore."
From the FIRST frame, display the hook together with a readable scope label:
"Ozark National Scenic Riverways • Developed campgrounds". Immediately explain
that scope in the next spoken sentence. Keep the label visible through both
sentences. Do not publish the broad hook alone or imply it applies to all
camping along the river. Remove "now"; this is not a new October policy.

Do not substitute the alternative "weekends are booking up" without evidence.
The short cut demonstrates a real Pulltite search and booking handoff. Capture
the arrival/departure dates, site identifier, and checked time; verify that the
SAME site is open for EVERY night of the stay. Do not sum nightly openings into
a stay-wide count. Any result shown is a dated example, not guaranteed inventory.
If there is no opening, record another real date rather than fabricate one.

## Prepare the voice audition

Requires Node 20 (the repository version), ffmpeg and ffprobe. No npm install.
From the repository root:

```sh
node marketing/campaigns/fall-camping/prepare-voice.mjs
# On an authorized runner with OPENAI_API_KEY already configured:
node marketing/campaigns/fall-camping/prepare-voice.mjs --cut=short --pace=brisk --generate
```

The default is offline and makes no paid API request. `--generate` makes one
speech request and saves source and normalized WAVs, the exact script and a
review manifest under ignored `out/<content-hash>/`. Repeating the same input
reuses that completed take. Edit delivery instructions to audition a new take.
The tool does not access production data, alter Read narration or send media
to TikTok/Instagram. Never commit credentials or raw app recordings.

After the workflow is merged onto the default branch, open GitHub Actions →
Camping Campaign Voice Preview → Run workflow and enable `generate_voice`.
Choose `cut` (long/short) and `pace` (relaxed/brisk).
Download the correspondingly named voice-audition artifact from the completed run. It uses the same
`OPENAI_API_KEY` secret referenced by the existing Read preview. Secret presence
and live speech generation have not been verified in this workspace. Leave
`generate_voice` disabled for an offline script/estimate check.

## What Evan needs to supply

One continuous portrait iPhone recording is enough; editing can split it:

For the short cut, also capture one complete Pulltite date/site/booking journey.

1. Open Camping and slowly browse the Current/Jacks Fork campground rows.
2. Open one supported NPS campground, ideally Pulltite or Alley Spring, with
   working availability. Show its photos and individual campsite openings.
3. Scroll the calendar to another weekend. Hold each important view 3–5 seconds.
4. Show the relevant river level/condition, reading timestamp and weather.
5. Return to the same campground and tap Book campsite. Stop after the correct
   Recreation.gov destination opens, before sign-in, checkout or payment.

Record with Do Not Disturb on, no microphone, no added captions or music, and
normal readable text size. Keep loading time in the raw recording; it can be
trimmed. Capture date and last-checked labels must remain truthful. Availability
must visibly be supported, not a no-data or first-come-only state.

Also supply 2–4 original or permission-cleared river/camping clips, ideally
5–10 seconds each, with location and approximate capture date. Portrait is
preferred. Useful shots: river through trees, campsite near water, coffee or
camp setup. Do not imply an off-river campsite is waterfront. Existing owned
clips or photos are acceptable; actual fall color is optional.

## Edit after voice approval

- 1080×1920, 30 fps. Lead with real scenery, then actual app use. Use Eddy's
  established mascot, colors and typography rather than introducing new branding.
  Opening hook and scope text must be present from frame one. A real creator
  at the river with a phone and app overlay is an optional alternate take.
- Keep the app large enough to read. Crop toward the spoken feature; avoid a
  tiny full phone inside multiple frames. Respect the existing social safe areas.
  Reserve the right-hand action column and roughly the bottom 20% (384 pixels
  at 1920 height) as an initial editing guide. Check the actual TikTok preview
  with its caption/buttons; this is not a universal pixel-safe specification.
- Align short caption phrases by listening to the final recording. Do not use
  estimated word timing as synchronized captions.
- Distinguish reservation planning from purchasing: the final booking happens
  on Recreation.gov. No claim that all NPS camping requires reservations.
- Preserve the script's river-level benefit without portraying a gauge reading
  as a campsite safety guarantee. Avoid calling stored availability live.
- Quiet music/river ambience only after the dry take is accepted. Prefer TikTok's
  Commercial Music Library for its TikTok export, or music with documented rights
  covering the intended commercial placement. Check Instagram rights separately;
  do not assume TikTok clearance transfers. Export a clean narration-only master.
  Recheck intelligibility on a phone speaker. No speed-up to hit a duration cap.
- Closing frame: Eddy and Link in bio, matching the spoken CTA. Before publishing,
  verify the actual platform profile has a working link to the intended Eddy app
  landing page. This is an outstanding publication check, not a verified setup.
  Keep eddy.guide/app as secondary brand information rather than a fake button.
- Put the campground question in the caption or a pinned comment: "Which
  campground's your fall pick: Pulltite, Alley Spring, or Two Rivers?"
  Keep one primary spoken action. Reuse opening scenery to make a natural loop.
- Apply TikTok's AI-generated-content disclosure for realistic synthetic narration
  and identify the narration in publication copy. The narrator speaks for Eddy;
  no invented personal experience. Evan's own voice is an optional comparison,
  not required to complete the agreed synthetic-voice audition.

## Review checklist

Listen for Eddy, Ozarks/Ozark National Scenic Riverways, Jacks Fork and
Recreation.gov pronunciation; confirm no omitted/extra words, false personal
testimonials or rushed ending. Verify the images match the named locations,
the demonstrated availability is real, and the booking destination matches.
Review the final mobile crop, captions, audio and full video decode before
manual publication approval.

Reservation fact checked October 5, 2026: NPS says developed campsites at
Ozark National Scenic Riverways require reservations in summer (April 15–October 15) and winter
(October 16–April 14). Both October and November are covered.
This began in 2025; do not advertise it as an October 2026 policy change.
Recheck before publishing:
https://www.nps.gov/ozar/planyourvisit/developed-campgrounds.htm

Speech interface follows the existing pinned Read model and OpenAI's speech
guide: https://developers.openai.com/api/docs/guides/text-to-speech
