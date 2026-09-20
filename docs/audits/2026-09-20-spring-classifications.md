# Spring classification audit — September 20, 2026

Status: corrections prepared, **not applied to production**. No database/admin
credentials were available in this session. Do not mark the map fixed yet.

Read-only live audit: `/api/offline/bundle` and `/api/rivers/{slug}/pois` for
all 24 rivers in that bundle, covering 28 public POIs, with no failed requests.
The public POI endpoint filters active/on-water records (except outfitters), so
this is not a complete database audit. Run `scripts/audit-spring-classifications.sql`
with database access to inspect inactive, off-water, and unassociated records too.

| River | POI | Live type | Disposition |
| --- | --- | --- | --- |
| Current | Welch Spring and Hospital | cave | Repair to spring |
| Current | Medlock Cave and Spring | cave | Repair to spring |
| Current | Big Spring | cave | Repair to spring |
| Buffalo | Granny Henderson's Cabin | spring | Repair to historical_site |
| Current | Devils Well | spring | Review separately: inland sinkhole/cave lake, not a river spring stop |

The first three have coordinates and are active/on-water, but the mobile bundle
selects only `type = 'spring'`, so it omits them. Granny Henderson's Cabin is
incorrectly included as a spring. All four repairs preserve names, descriptions,
images, coordinates, river miles, and access/active flags.

The migration `20260905125455_a_spring_is_a_spring_and_a_cabin_is_not.sql`
already describes corrections for Welch, Big Spring, and the cabin. It is in the
production ledger, but current API values disagree. This does not prove whether
rows were subsequently edited, restored, or a correction failed to match. Medlock
was omitted from that migration. Do not edit historical migration files or mark
a new migration applied to conceal this discrepancy.

Additional review:
- Devils Well is now exposed in the public endpoint and mobile spring bundle,
  contradicting the migration's stated intent to leave it inactive/off-water.
  Review classification and access flags independently; the repair script does
  not silently disable the destination or change its access claims.
- Alley Spring and Mill is absent from the public Jacks Fork POI response and
  mobile spring list. The earlier migration describes an attached historical
  record plus an inactive orphan duplicate. Database inspection is needed to
  establish today's state before choosing a canonical row.
- Eureka Springs Adventures at Wanderoo Lodge is an outfitter; “Springs” in a
  business name is not grounds for reclassification.
- NPS `categorizePOI` searches title AND body for “spring” before other categories.
  That can misclassify a historical site's prose about nearby springs. The NPS
  upsert writes type and active/on-water flags on every sync. This is a recurrence
  risk, not proof of what changed these specific records.

## Apply and verify

From `missouri-float-planner`, with admin credentials configured:

```sh
npx tsx scripts/repair-spring-classifications.ts
EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur npx tsx scripts/repair-spring-classifications.ts --apply
```

The script validates all four IDs, names, rivers, and source types before writing;
rechecks them in each update; supports already-corrected rows; and verifies the
final types. Updates are sequential: a later failure can leave earlier corrections
applied, which are safe to skip on a rerun. This is a data repair, not a schema
migration, so the production migration ledger remains unchanged.

After application, check the public Current POI response, then the offline bundle:
Welch, Medlock, and Big Spring must appear in Current springs; the cabin must no
longer appear in Buffalo springs. The bundle uses a 1-hour CDN TTL with stale
revalidation and the iOS client checks it on launch. Database success alone does
not establish that a cached phone has refreshed. Reopen the app online and inspect
the Springs layer at local zoom after the public bundle has updated.
