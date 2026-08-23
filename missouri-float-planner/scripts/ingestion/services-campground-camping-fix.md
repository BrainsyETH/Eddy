# The 13 campgrounds that do not say they offer camping

`npm run db:check-services` records 13 rows of `type = 'campground'` carrying
neither `camping_primitive` ("Tent Camping") nor `camping_rv` ("RV Sites").
They came from the corridor CSVs, which spelled the offering `camping` — not a
`service_offering` value — and the old importer dropped it with a warning.

Nine are corrected by `services-campground-camping-fix.csv`, each against the
operator's or the managing agency's own page. Four are held back, and two of
those are a different and worse defect.

## Corrected — nine rows

| Slug | Source | What the source says |
| --- | --- | --- |
| `silver-mines-campground-usfs` | USFS Mark Twain NF | 11 electric + 59 non-electric sites, vault toilets, potable water, no showers, open Mar–Oct |
| `withrow-springs-state-park` | Arkansas State Parks | 29 Class AAA (water/50-amp/sewer) + 10 walk-in tent sites — matches the stored 29/10 exactly |
| `wolf-pen-recreation-area` | USFS Ozark–St. Francis NF | "6 primitive units", vault toilets, no drinking water, open all year |
| `redding-recreation-area` | USFS Ozark–St. Francis NF | bath house with flush toilets and warm showers, open all year |
| `washington-state-park-campground` | MO State Parks camping page | Basic, Electric, Family Electric and Platform Tent sites |
| `st-francois-state-park-campground` | MO State Parks camping page | Basic, Electric and Family sites; 100+ campsites, modern restrooms, hot showers |
| `war-eagle-campground-beaver-lake-coe` | recreation.gov | 26 standard electric sites; each takes "one RV and one tent, or three tents"; flush toilets, drinking water, fire rings |
| `rocky-top-campground-cabins` | visitmo.com (MO Division of Tourism) | 20 RV sites with water and 20/30/50-amp electric, tent sites, 17 cabins, dump station |
| `caddo-river-access-rv-park` | operator site | full-hookup RV sites, Wi-Fi, open year-round |

`redding-recreation-area` gets `camping_primitive` only. Aggregators disagree
about whether it has electric sites — one says three, one says six, one says
none — and the USFS page does not say. A conflict among aggregators is exactly
the case where the rule is corroboration only, so no `camping_rv` claim.

Two websites were stale and are corrected in the same pass:
`arkansasstateparks.com` now 301s to `arkansas.com`, and the two Missouri state
park rows pointed at the park overview rather than its camping page.

## Held back — needs a human

| Slug | Why |
| --- | --- |
| `fancy-hill-cabins-rv-park` | The operator site renders no facility detail, and its title says "Cabins Near Little Missouri Falls". The name claims an RV park; nothing published confirms it. |
| `big-river-outdoors-campground` | No website on file, and every source that describes it is an aggregator. They also place it in Mineral Point, Frankclay or Irondale while the row says De Soto, so the town is in question too. |

## Not campgrounds at all

Both of these are day-use sites recorded as `type = 'campground'`, which means
Eddy currently offers somewhere to sleep at two places nobody may sleep. That
is worse than a missing offering, and it is not something a CSV should quietly
fix — `service_type` has only `outfitter`, `campground` and `cabin_lodge`, so
there is no correct value to move them to.

| Slug | What it actually is |
| --- | --- |
| `dillard-mill-campground` | Dillard Mill State Historic Site — a day-use historic site on Huzzah Creek. MO State Parks lists picnicking, trails, fishing and tours, and no camping. An access point `dillard-mill` already exists on the same river, so the directory row is also a duplicate of a place Eddy already has. |
| `fred-berry-conservation-education-center-on-crooked-creek` | An AGFC nature centre: a classroom, a pavilion, six miles of trail and an archery range, open 8:30–4:30. No overnight anything. |

The choice is yours: delete both from `nearby_services`, or keep them and give
the directory a way to say "day use". Nothing in this branch touches them.
