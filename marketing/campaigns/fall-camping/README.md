# Fall camping highlight

One conversational highlight, about 20 seconds: Pulltite reservation hook over
Eddy → campsite availability → river reading → Recreation.gov → riverside CTA.

## Supplied footage

Evan supplied these on October 6, 2026:
- ScreenRecording_10-06-2026 14-56-25_1.MP4: Pulltite, Tonight/Tomorrow availability,
  Current River reading and booking handoff to site 004.
- IMG_9185.mov: portrait riverside camping footage for the closing atmosphere.

Use the app footage for the reservation hook. The scenery shows gravel-bar
camping and must not illustrate a claim that this camping requires reservations.
The narration now says "See which campsites are open, right in Eddy." Do not
claim the recording demonstrates an entire weekend stay. Trim loading screens.

## Voice and final edit

Requires Node 20, ffmpeg and ffprobe; no npm install.

```sh
node marketing/campaigns/fall-camping/prepare-voice.mjs
# On an authorized runner with OPENAI_API_KEY configured:
node marketing/campaigns/fall-camping/prepare-voice.mjs --generate
```

Default: short/brisk, 160–175 words per minute. The relaxed preset alone asks
for unhurried delivery. Both legacy cut choices use the same highlight;
shortScenes references scene IDs to avoid duplicated copy.

The default run is offline. Generation saves a cached continuous voice take,
script and listening-review manifest under ignored out/. The existing Camping
Campaign Voice Preview workflow can generate it once available on the default
branch. No social publication occurs.

The visual preview is silent, with provisional scene timing. Generate and
listen to the voice, then align the final cuts and captions to the actual take.
Keep the 1080×1920 app views readable and clear of platform controls. Use existing
Eddy branding. Verify the bio link before posting. Apply the platform AI audio
disclosure for synthetic narration. Any music needs appropriate commercial
rights for the destination platform.

Status: footage received and narration matched to it. Voice generation and the
final audio/video review remain outstanding; no OPENAI_API_KEY was available in
the editing workspace. Source footage is not committed to the repository.

Fact check, October 6, 2026: NPS lists Pulltite as a developed campground and
requires developed campsite reservations in both summer and winter.
https://www.nps.gov/ozar/planyourvisit/developed-campgrounds.htm
