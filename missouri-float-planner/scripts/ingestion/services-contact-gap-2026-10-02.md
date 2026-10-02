# Contact gap corrections — 2026-10-02

Status: prepared, **not applied**. The CSV updates 13 existing records by explicit slug. The snapshot preview projects `no_contact` from 16 to 3. No inserts, renames, coordinate changes, or river-link changes are proposed. Booking URLs remain optional and are not a completeness metric.

## Evidence

Each page below was opened during this research pass. Dates record a web-source check, not a telephone call or a full-property audit. Only the provided contact fields and their provenance are claimed. Existing descriptions, offerings, status, addresses and coordinates have not been reverified. The importer also advances row-level `last_verified_at`; field sources identify the narrower scope of this pass.

| Existing listing | Source opened | Proposed contact |
| --- | --- | --- |
| 4J Vacation Rentals | https://4jvacationrentals.com/contact/ | 573-205-9032 |
| Driftwood Vacation Rentals | https://www.driftwoodvacationrentals.com/ | 573-205-1961 |
| Indian Springs Family Resort | https://indianspringsfamilyresort.com/ | 573-775-2266 |
| Kick'n K Farmhouse | https://www.kicknk.com/Accommodations/ | 573-259-5597 |
| Meramec Park Concessions | https://www.meramecpark.com/river-float-trips/canoes-kayaks-and-rafts/ | 573-468-6519 |
| Patrick Bridge Campground | https://mdc.mo.gov/discover-nature/places/patrick-bridge-access | 417-746-0291 |
| River Ridge Cabins | https://www.riverridgecabins.com/contact-us | 573-840-0360 |
| RiverTime RV | https://rivertimerv.com/contacts/ | 417-372-7301 |
| Shady Lane Cabins | https://www.book-it-now.com/shadylanecabins/ | 573-226-3893; booking link |
| Shawnee Creek Cottages | https://shawneecottages.com/ | 573-226-5295 |
| Story's Creek Campground | https://storyscreekcampground.com/ | 573-276-8881 |
| The Rafting Company | https://www.theraftingco.com/Floating.html | 800-426-7238 |
| War Eagle Creek Retreat - Cabin on the Creek | https://www.vrbo.com/en-gb/p3938780vb | Host listing; no public phone; booking link |

The Rafting Company's toll-free floating number is used as the primary phone. Its root website now includes a sandwich-shop menu, so this CSV links directly to the operator's floating page and does not substitute the food-ordering number. Shady Lane's operator booking page verifies the phone and booking URL; its separate homepage could not be opened, so website stays blank. War Eagle's exact property title and Huntsville location match the host's VRBO listing; website and reservation URL point to that listing, not a search page. Kick'n K's official page matches the existing business name and 3 Farm House Lane address; this is not an ownership or rename correction.

## Three unresolved rows

- `current-river-campground-van-buren`: Stay Current River's campground page describes Deer Run. The existing generic-name row has too little identifying information to establish the same property. Do not attach its contacts without corroboration.
- `rt66-canoe-rental`: directory listings agree on 20105 Trophy Lane and a phone, but the operator domain rt66canoe.com could not be opened. A primary-source confirmation is still needed; failed retrieval is not evidence of closure.
- `the-landing-meramec`: the Sullivan record remains unidentified. Do not use The Landing in Van Buren as a match.

## Validation and application

The adjacent `.diff.txt` was generated from the existing importer's exported parse, validation, collision, planning and rendering functions against the read-only production snapshot of 200 records. Assertions passed for all 13 existing UUIDs, no relationship changes, the allowed contact/provenance fields only, per-field sources, simulated read-back, projected 16 → 3 no-contact debt, and an unchanged second run. This is a snapshot preview, not a connected CLI dry-run or a production write.

The environment has only a partial checkout and Node 24, without the project's Node 20 dependencies. Four contact-action regression tests passed using Node's TypeScript stripping. Full web/mobile typecheck, lint, tests and iOS bundling must pass in App CI; no simulator or browser interaction test was run here.

From a full Node 20 checkout with the authorized target environment, rerun:

```bash
cd missouri-float-planner
EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur npm run db:import-services -- scripts/ingestion/services-contact-gap-2026-10-02.csv
npm run db:check-services
```

Review that connected diff against the attached preview and get approval before applying to production. Use the importer's normal guarded write path, without `--overwrite`; retain its post-write verification. After the approved import, run `npm run db:check-services`, then regenerate the baseline with the existing guarded `--update-baseline` path and review the exact slug removals. Do not regenerate the production baseline from the proposed snapshot or absorb unrelated new debt.

The display patch exposes separate Call, Website and (when present) Book actions for directory map pins, separate Call and Website actions for embedded access-point services, and stored phone/booking actions on web lodging/outfitter cards. Canonicalizing embedded business references remains separate work; this batch does not rewrite those copies.

