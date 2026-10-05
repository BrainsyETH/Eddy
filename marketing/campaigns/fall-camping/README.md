# Fall camping campaign — production handoff

Status: approved script and voice preparation ready; narration and final video
have not been generated or approved. Real app captures and opening/closing
footage are outstanding. Nothing in this directory publishes content.

## Creative direction

Conversational creator: a friendly paddler explaining a useful app. Camping
is the story; river conditions and weather support the weekend decision.
Use the exact approved script in `campaign.json`. Every scene has its spoken
text, intended screen action and requested asset filename. Generate one
continuous narration take so the delivery retains natural phrasing.

Start with Marin, using the existing Eddy Read model snapshot but distinct
campaign delivery instructions. Review the dry voice before adding music.
Do not force a 30- or 45-second cut: this script's word count determines a
longer initial audition. The preparation command prints the duration estimate;
the measured recording determines the final edit.

## Prepare the voice audition

Requires Node 20 (the repository version), ffmpeg and ffprobe. No npm install.
From the repository root:

```sh
node marketing/campaigns/fall-camping/prepare-voice.mjs
# On an authorized runner with OPENAI_API_KEY already configured:
node marketing/campaigns/fall-camping/prepare-voice.mjs --generate
```

The default is offline and makes no paid API request. `--generate` makes one
speech request and saves source and normalized WAVs, the exact script and a
review manifest under ignored `out/<content-hash>/`. Repeating the same input
reuses that completed take. Edit delivery instructions to audition a new take.
The tool does not access production data, alter Read narration or send media
to TikTok/Instagram. Never commit credentials or raw app recordings.

After the workflow is merged onto the default branch, open GitHub Actions →
Camping Campaign Voice Preview → Run workflow and enable `generate_voice`.
Download `fall-camping-voice-audition` from the completed run. It uses the same
`OPENAI_API_KEY` secret referenced by the existing Read preview. Secret presence
and live speech generation have not been verified in this workspace. Leave
`generate_voice` disabled for an offline script/estimate check.

## What Evan needs to supply

One continuous portrait iPhone recording is enough; editing can split it:

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
- Keep the app large enough to read. Crop toward the spoken feature; avoid a
  tiny full phone inside multiple frames. Respect the existing social safe areas.
- Align short caption phrases by listening to the final recording. Do not use
  estimated word timing as synchronized captions.
- Distinguish reservation planning from purchasing: the final booking happens
  on Recreation.gov. No claim that all NPS camping requires reservations.
- Preserve the script's river-level benefit without portraying a gauge reading
  as a campsite safety guarantee. Avoid calling stored availability live.
- Quiet licensed music/river ambience only after the dry take is accepted.
  Recheck intelligibility on a phone speaker. No speed-up to hit a duration cap.
- Closing frame: Eddy, iOS download cue, eddy.guide/app. Keep the frame for
  around two seconds after the last word if the pacing allows.
- Identify the AI-generated narration in the accompanying publication copy.

## Review checklist

Listen for Eddy, Ozarks/Ozark National Scenic Riverways, Jacks Fork and
Recreation.gov pronunciation; confirm no omitted/extra words, false personal
testimonials or rushed ending. Verify the images match the named locations,
the demonstrated availability is real, and the booking destination matches.
Review the final mobile crop, captions, audio and full video decode before
manual publication approval.

Reservation fact checked October 5, 2026: NPS says developed campsites at
Ozark National Scenic Riverways require reservations in summer and winter.
This began in 2025; do not advertise it as an October 2026 policy change.
Recheck before publishing:
https://www.nps.gov/ozar/planyourvisit/developed-campgrounds.htm

Speech interface follows the existing pinned Read model and OpenAI's speech
guide: https://developers.openai.com/api/docs/guides/text-to-speech
