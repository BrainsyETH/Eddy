# Fall camping highlight

One 15.6-second highlight: Pulltite reservation hook over Eddy, campsite
availability, river reading, Recreation.gov and the riverside closing CTA.

## Status

The supplied footage has been edited with generated Marin narration. The final
take includes the complete bio CTA, verified against its audio transcript.
The export is 1080×1920, 30 fps, with AAC voice audio. Full decoding and layout
bounds checks pass. Review playback and the destination platform preview before
posting; nothing here posts to a social account.

## Footage

- `ScreenRecording_10-06-2026 14-56-25_1.MP4`: Pulltite, Tonight/Tomorrow
  availability, Current River reading and site 004's Recreation.gov page.
- `IMG_9185.mov`: riverside camping atmosphere for the closing shot.

The reservation hook stays over the app, not the gravel-bar footage. Availability
copy says "See which campsites are open, right in Eddy"; no weekend-stay claim.
Source recordings and rendered binaries stay outside git.

## Branding and safe areas

`export-theme.ts` imports `shared/social-brand.ts`; there is no separate campaign
palette or safe-area definition. The renderer uses the light editorial surface,
Fredoka/Geist, thick teal card borders, hard shadows, coral accents and the existing
campfire Eddy artwork. Important content stays within `REEL_SAFE`, currently
x=120–810 and y=250–1500. Media borders, text, logos, captions and CTA are checked.
The roomy top, bottom and right reserves are intentional platform UI space.

## Voice

The standalone Node 20 preparation script remains offline by default:

```sh
node marketing/campaigns/fall-camping/prepare-voice.mjs
# Authorized environment with OPENAI_API_KEY already configured:
node marketing/campaigns/fall-camping/prepare-voice.mjs --generate
node marketing/campaigns/fall-camping/align-voice.mjs
```

Speech and transcription are paid requests only when explicitly run. The Actions
workflow uses the existing `OPENAI_API_KEY` secret and uploads WAVs, the script,
review metadata and actual-audio word timestamps. It can be manually dispatched;
on this campaign branch only, changing `voice-request.json` also requests a take.
Normal code pushes do not request paid audio. `reuseRun` can identify a prior
campaign voice artifact to align without generating speech again. Its artifact
must still exist. Do not place credentials in any request file.

The final take is from Actions run 37525407757, hash `2e78210383b7b098`.
`edit.json` uses its actual phrase timing and a closing hold. The renderer checks
the voice hash, exact WAV checksum and full normalized transcript; a new voice
requires reviewing and updating the edit instead of reusing guessed timing.
No playback acceleration or music is applied.

## Rebuild

Requires ffmpeg/ffprobe, Python with Pillow/fontTools, and the repository's existing
Remotion Node 20 dependencies for exporting the shared TypeScript tokens.
Download the voice artifact and supply the two original recordings locally.

From `missouri-float-planner/remotion`:

```sh
node --import tsx ../../marketing/campaigns/fall-camping/export-theme.ts /tmp/camping-theme.json
```

Then from the repository root (replace the three input paths):

```sh
python3 marketing/campaigns/fall-camping/render-highlight.py \
  --screen /path/to/screen-recording.MP4 \
  --scenery /path/to/IMG_9185.mov \
  --voice-dir /path/to/2e78210383b7b098 \
  --theme /tmp/camping-theme.json \
  --edit marketing/campaigns/fall-camping/edit.json \
  --output marketing/campaigns/fall-camping/out/Eddy-Camping-Highlight.mp4
```

The default artwork/fonts come from existing repository assets. The output's
`.layout.json` records checked bounds and the voice identity. The final voice
is muxed at normal speed, with silence only for the closing visual hold.

Before posting, verify the bio link and apply the platform's AI audio disclosure.
No music is included. NPS reservation fact check, October 6, 2026:
https://www.nps.gov/ozar/planyourvisit/developed-campgrounds.htm
