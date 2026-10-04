# Place-image coverage, October 4, 2026

## Changes

- Onboarding now bundles 22 of 24 dam photos, up from 3. The 19 new JPEGs
  are 640 × 400 crops; all 22 assets total about 1.1 MB. Original URLs,
  source hashes, credits, licenses and transformations live in
  `eddy-ios/assets/onboarding/credits.json`. The existing credits sheet shows
  every mapping. No native dependency changed.
- Camping overview reads structured campground photos in
  `nearby_services.details.images` when its linked NPS record has no usable
  overview image. Both tracked and untracked campgrounds use this path.
  Maps, numbered campsites, unsafe URLs, and unrelated access-point images
  remain excluded. No upstream requests were added to the overview.
- `src/data/reviewed-place-photos.json` is the exact-ID source/rights record
  for the four approved database additions below. The public credits page
  is linked from the website footer and app Settings. Wikimedia-original
  and USFWS-image paths are added to the restricted thumbnail optimizer.

| Record | Target | Reviewed photo |
| --- | --- | --- |
| Dry Run Creek / Norfork hatchery access | `access_points.image_urls` | USFWS Robert Pos creek scene; explicitly public domain |
| Blue Spring, Jacks Fork | `points_of_interest.images` | NPS Jessica Poppa spring photo already used by its exact campground |
| Alley Spring and Mill | `points_of_interest.images` | christopher friese, CC BY 2.0; source/license preserved and publicly credited |
| Pulltite Campground | `nearby_services.details.images` | NPS Wil Marischen campground scene from the summer visitor page |

Pulltite's curated photo is kept on the canonical service record, so a future
NPS campground sync cannot replace it with the provider's map-only array.
Its tracked facility already links this exact service. These are scenery
images, not current water or campsite-condition evidence.

## Rollout

1. Merge/deploy the web code, including `/photo-credits` and optimizer hosts.
2. From `missouri-float-planner`, with the normal admin environment configured:

   ```sh
   npx tsx scripts/backfill-reviewed-photos.ts
   EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur npx tsx scripts/backfill-reviewed-photos.ts --apply
   ```

   Preview validates all identities first. Apply fills only empty media,
   retains unrelated service facts, checks each observed `updated_at`, and
   reads each changed row back. A concurrent edit stops the batch; an earlier
   successful row can remain applied. Re-previewing is safe and skips it.
3. Ship the iOS JS/assets update through the usual release process. No new
   native module was introduced. Check small and wide onboarding cards and
   the photo-credits link on a device.
4. Let public catalog/CDN caches refresh; check the Jacks Fork POI images,
   Pulltite camping-grid thumbnail, and Dry Run Creek when reviewing the
   inactive tailwater catalog. This batch does not activate any river.

No schema migration is needed. No production backfill was run while preparing
this PR; it depends on the new public credits page being deployed first.

## Validation

- Web and mobile typechecks passed; lint reported warnings only, and the
  Tailwind token/palette check passed.
- All 3,051 registered tests and 16 recommendation pretests passed on Node 20
  after rebasing onto `a890b3f`.
  The local environment blocks the `tsx` CLI's IPC socket, so the same
  registered files ran with `TSX_TSCONFIG_PATH=tsconfig.test.json node --import
  tsx --test` instead. No test or gate was removed.
- `make bundle-mobile` passed, including the production iOS export and
  `.easignore` archive verification. Device UI validation remains a rollout step.
- All 22 dam crops were visually inspected. The four remote place URLs returned
  HTTP 200 JPEGs. Reviewed web POI thumbnails and native thumbnails use the
  existing image optimizer rather than downloading the full originals.
- A fresh read-only Supabase snapshot confirmed all four targets are still
  missing media. The backfill planner produced four additions, verified their
  resulting media, and skipped each on a simulated second run. The credentialed
  script itself must still be previewed against the target at rollout time.

## Deliberate holds

Clearwater's candidate still lacks a verified image-specific reuse grant.
Broken Bow's candidate depicts the separate spillway, not the main dam.
They retain Eddy artwork and are listed in `eddy-ios/assets/onboarding/held.json`.

The initial audit found 48/360 approved access points empty (12 on active
rivers), 15/29 active POIs empty, and 14/36 enabled camping rows without a
qualifying hero. This batch does not claim to close all of those gaps. The
remaining state/municipal/operator photos need appropriate reuse evidence;
several access points still need exact-place photos. Akers, Cedar Spring,
Dee Murray, and Grubb Hollow must not receive maps or arbitrary numbered-site
photos just to remove a placeholder. Existing park photos depicting rivers,
caves, or unrelated ramps were not repurposed as campground photographs.
