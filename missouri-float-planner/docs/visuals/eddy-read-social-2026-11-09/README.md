# Eddy’s Read social preview — November 9, 2026

This draft replaces the scrolling report with river scenes and phrase captions.
The existing full summaries, source qualifications, river-selection rules and
caption reporting remain. The website and iOS Read rendering are not changed.

## Visual evidence

Actual Chromium renders from the changed Remotion composition:

- [Current River opening](../../../remotion/test/baselines/social-eddy-read-current@0.png)
- [Current River mid-report](../../../remotion/test/baselines/social-eddy-read-current@600.png)
- [Photo scene](../../../remotion/test/baselines/social-eddy-read-weekend@0.png)
- [Next river](../../../remotion/test/baselines/social-eddy-read-weekend@450.png)
- [Ending](../../../remotion/test/baselines/social-eddy-read-weekend@703.png)

The Current River data is the existing historical October 3 fixture, not live
conditions. The multi-river text explicitly describes a layout test and makes
no current-condition claim. Its Buffalo photo is real, historical NPS scenery,
not a live view. The image bytes are copied from the existing reviewed cover
catalog (`buffalo-kyles-landing`) for deterministic, network-free rendering:
[Commons source and public-domain provenance](https://commons.wikimedia.org/wiki/File:Kyles_Landing_launch_area._(316733c4-3722-4b63-9eaa-bcc817a8e569).jpg).
The second river has no photo and exercises the branded fallback.

## Checks and remaining review

- 688 sampled browser frames across four compositions: every phrase retained in
  order, correct river transitions, loaded Eddy artwork, safe bounds and no
  caption/footer collisions.
- Twelve changed/new stills reviewed and committed. Local Chromium differs from
  CI's pinned Chrome; CI must confirm the baselines or regenerate its canonical
  anti-aliasing through the existing `update_baselines` workflow input.
- Remotion TypeScript and five narration/audio tests pass. Synthetic tones only
  exercise timing, caching and mixing; they are not a voice preview.
- The existing `Remotion Check` workflow has a review-only `voice_preview` input.
  Run it from this branch to synthesize a newly directed Marin voice and render
  the historical Current River fixture. It uploads an artifact without posting.
  Local speech credentials are unavailable; no generated voice has been heard
  or approved for this revision. Keep the PR draft until the listen-through.

Regenerate saved MP4s after deployment to pick up the new composition and voice.
No social posts, production database rows or posting settings were changed.
