# Individual campsite photos

The iOS Camping tab requests `/api/campsites/photos?facility=<Eddy UUID>` after
site inventory arrives, only while Camping is active. Availability never waits
for media. Photos map Eddy site UUIDs to up to eight images with titles and credits.
The existing site availability response and database schema are unchanged.

## Coverage

Recreation.gov/RIDB is the first supported provider. The documented
`GET /facilities/{facilityId}/campsites` response includes `ENTITYMEDIA`.
Only `Image` records with `EntityType: Site` and the exact `EntityID` are used;
the parent facility ID must also match. Eddy joins through `source_site_id`,
never names, loop numbers, or campground-level imagery.

Contract: https://ridb.recreation.gov/shared/swagger/ridb.yaml

Missouri State Parks/UseDirect and other providers keep their existing UI.
This feature does not imply they have no site photos; their media feed has not
been integrated. Empty and failed images fall back to text rows. The thumbnail
opens an in-app gallery with credits, previous/next controls, and pinch zoom.
The separate text target retains the exact site's booking link.

## Caching and release

- Backend needs the existing server-only `RIDB_API_KEY` environment variable.
- Successful RIDB pages cache for 24 hours, including sites without media.
- API responses cache for one hour with one day of stale-while-revalidate.
- Unsupported sources return empty maps; missing credentials/provider failures
  return an uncached 503. The app silently keeps its availability/text UI.
- Images use the native iOS URL cache; no new native dependency or DB migration.

Deploy the API before releasing the app. Older API deployments return 404 for
the optional photo request and remain usable. This PR does not deploy either.
Before release, verify a tracked Recreation.gov facility's endpoint returns
nonempty exact-site photo entries with production credentials. On an iPhone,
check thumbnail vs booking taps, gallery navigation/zoom/close, VoiceOver, dark
mode, failed images, and changing pins/tabs while photos load. Check that a
UseDirect facility retains its compact availability summaries.
