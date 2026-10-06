# Fall camping highlight

One conversational camping highlight, about 20 seconds: Pulltite reservation
hook → available campsite in Eddy → river level → Recreation.gov → link in bio.
The spoken hook and matching first-frame text are accurate on their own:
"Camping at Pulltite? You need a reservation."

## Capture, then voice, then edit

Supply one portrait iPhone recording:
1. Open Pulltite in Eddy and show a campsite open for every night of a real stay.
   Hold the dates, site number and checked time long enough to read.
2. Show the relevant Current River level and reading timestamp.
3. Tap Book campsite and show the matching Recreation.gov destination. Stop
   before sign-in or checkout.

Also supply one owned or permission-cleared river/camping clip for the opening
and closing. Record the app without added music or captions.

After capture, confirm the search sentence in `campaign.json` matches what is
shown; adjust it to the actual result before generating voice. Availability is
a dated example, not a guarantee. Then generate one continuous narration take,
listen, and edit the footage to that take.

## Voice preparation

Requires Node 20, ffmpeg and ffprobe; no npm install.

```sh
node marketing/campaigns/fall-camping/prepare-voice.mjs
# On an authorized runner with OPENAI_API_KEY configured:
node marketing/campaigns/fall-camping/prepare-voice.mjs --generate
```

Default: short/brisk, 160–175 words per minute. Relaxed delivery remains available
with `--pace=relaxed`; only that preset requests an unhurried delivery.
Pace warnings prompt a listening review, not automatic rejection.
Both existing cut options select this same highlight for workflow compatibility;
`shortScenes` references scene IDs so shared copy cannot drift.

The default run is offline. `--generate` makes one speech request and saves the
source, normalized WAV, script and review manifest in ignored `out/<hash>/`.
Identical inputs reuse the completed take. No social publication occurs.
The existing Camping Campaign Voice Preview workflow can generate the audition
once available on the default branch; choose short/brisk.

## Edit and publish

- 1080×1920, 30 fps. Hook text from frame one, readable app footage, captions
  aligned to the actual voice. Keep text clear of the right-side buttons and
  bottom 20%; check the platform preview.
- Use the existing Eddy branding. Keep the river-level benefit brief.
- Show booking finishing on Recreation.gov. Verify the bio link.
- Add quiet commercially cleared audio only after the voice is approved.
  Check music rights separately for TikTok and Instagram. Apply the platform
  AI narration disclosure for synthetic voice.
- Review pronunciation, captions, mobile crop and full video playback.

Status: script and voice preparation updated. App capture, scenery, narration
and final video are still outstanding.

Fact check, October 6, 2026: NPS lists Pulltite as a developed campground and
requires developed campsite reservations in both summer and winter.
https://www.nps.gov/ozar/planyourvisit/developed-campgrounds.htm
