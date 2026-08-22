# Arkansas POI audit — reconciliation record

**Date:** 2026-08-21
**Subject:** an external "Eddy POI Gap-Fill Audit" proposing ~30 access points,
~10 outfitters and a set of hazards across five Arkansas rivers, plus two
"CONFLICT/STALE" corrections and an RLS advisory.
**Outcome:** three migrations landed; ~26 proposed access points and ~8 proposed
services rejected as duplicates; one HIGH-confidence coordinate rejected as
provably wrong; two "stale data" corrections rejected for lack of current
evidence.

This file exists so the next audit starts from data instead of from the same
false premise. If you are about to commission or run one, read
[Reproduce the diff](#reproduce-the-diff) first.

---

## The premise that produced most of the errors

The audit reported that it could not query the application tables:

> "the available Supabase SQL tool (`query_logs`) reaches only the ClickHouse
> logs stream, not the Postgres application tables"

and reasoned from there that the Arkansas rivers were probably thin. Both halves
are wrong. `execute_sql` reaches `public.*` normally; the full per-river
inventory is one query (below). And Arkansas was not thin.

Its own closing recommendation anticipated this exactly — "if a direct read path
to `public.rivers`/`access_points` becomes available … that will convert most
MEDIUM 'possibly missing' items into definitive NEW vs ENRICH classifications" —
so the audit knew which check mattered and concluded it was unavailable without
testing it.

## What was actually verified

Every count the audit reported is exact. The schema reconnaissance is good work
and worth keeping: the `access_points` CHECK constraints, the PostGIS
`location_orig` vs `driving_lat`/`driving_lng` split, and the `nearby_services`
provenance columns are all described correctly.

| table | rows |
| --- | --- |
| `rivers` | 25 |
| `access_points` | 406 |
| `points_of_interest` | 51 |
| `nearby_services` | 156 |
| `river_gauges` | 48 |
| `nps_campgrounds` | 34 |
| `river_hazards` | 19 |
| `gauge_stations` | 14,293 |
| `service_rivers` | 190 |
| `trust_findings` | 72 |

**Every one of the 406 access points already has geometry** (`location_orig IS
NOT NULL`), on every river. There were no coordinate-less accesses to fill in.

## Per-river diff

| river | existing accesses | audit proposed | genuinely new |
| --- | --- | --- | --- |
| kings-river | 10 | 5 | **0** |
| war-eagle-creek | 7 | 4 | **0** |
| caddo-river | 4 | 4 | 0 |
| crooked-creek | 9 | 6 | 1 (George's Creek) |
| mulberry | 7 | ~10 | 3 (Oark Hwy 103, Little Mulberry, Milton Ford) |

Services fared the same: Kings River Outfitters (phone matched exactly), Caddo
River Camping & Canoe, Lucky's, Arrowhead, Steve Dally, OAR, Turner Bend and
Byrd's were all already present. The audit also missed existing rows it should
have known about — Caddo's Norman Boating Access, War Eagle's AGFC "Chicken
House" walk-in, and Crooked Creek's Brooksher Float Campsite (which it listed as
a *camping note*, not knowing it was already an access point).

## Four errors, with evidence

### 1. A HIGH-confidence coordinate that would have corrupted production

The audit lists **J.D. Fletcher / Hwy 62** at `36.31483, −93.66350`.

```
audit J.D. Fletcher  →  existing trigger-gap-landing      0 m
audit J.D. Fletcher  →  existing j-d-fletcher-access-hwy-62   9,176 m
```

It is Trigger Gap's coordinate, copied down one row. Recommendation 1 said to
ingest these as `geocode_precision = 'exact'`, which would have moved a correct
take-out nine kilometres and broken every float-time and segment calculation
below it.

Production is demonstrably right: its river miles (Rockhouse 51.48 → Trigger Gap
59.15 → Fletcher 71.98) reproduce the audit's own cited 7.5 mi and 12.75 mi runs
to within 0.2 mi.

**Disposition:** coordinate discarded. No migration.

### 2. Rockhouse — 1,343 m apart, not adjudicable from the desk

Audit `36.26983` vs production `36.28193`, identical longitude — consistent with
a DMS minute-decimal misread (36°16.19′ against roughly 36°16.92′). Production
reproduces the canonical 7.5-mile Rockhouse→Trigger Gap run.

**Disposition:** production kept. Needs an independent agency source or a field
fix to move.

### 3. Two field values that cannot be written

- `managing_agency = 'AGFC'` (and `'County/AGFC'`, `'AGFC/roadside'`,
  `'Municipal/AGFC'`, `'AGFC/Public'`) violates
  `access_points_managing_agency_check`. The house convention is
  `ownership = 'AGFC'` with `managing_agency = NULL`, which ~15 existing AGFC
  rows already use. The agency is not lost; it is in `ownership`.
- `verified_source`, `geocode_source`, `geocode_precision` **do not exist on
  `access_points`** — they are `nearby_services`-only. The audit's schema section
  got this right and its recommendation contradicted it.

### 4. A correction that would have deleted a valid record

The audit inferred that "War Eagle Canoeing & Campgrounds" was renamed to OAR and
recommended `status = 'permanently_closed'`, at HIGH priority. Production holds
**both, as distinct active businesses**:

| name | coords | phone |
| --- | --- | --- |
| OAR War Eagle Kayak & Campground | 36.147354, −93.738650 | (479) 431-0444 |
| War Eagle Canoeing & Camping (War Eagle R.V. Resort) | 36.206751, −93.863238 | (479) 530-3262 |

4.5 km apart, different phone numbers, both geocoded `exact` and both verified
2026-08-09.

**Disposition:** neither closed. If a shared lineage is ever established, it
belongs in `alt_names`, not in a closure.

## What was landed

### `20260822143308_backfill_marks_and_snap_diagnostics_acl.sql`

Closes both ERROR-level `get_advisors(type: security)` findings. The audit
reported one and understated it; it missed the other.

`public.dam_history_backfill_marks` had **RLS disabled** *and* granted `anon` and
`authenticated` the full set including `DELETE` and `TRUNCATE`. That table has no
application call sites at all — its only job is to be the guard row for a
non-idempotent, destructive repair (`20260816112125` shifts every
`dam_metric_readings` row back one hour and says of itself "NOT idempotent by
construction — running it twice shifts twice"). An unauthenticated caller could
delete the marker and arm that repair to run again. Unlike the `cron_runs` case
in `20260810201000`, no second mechanism was holding the door.

`public.gauge_snap_diagnostics` is a `postgres`-owned view with `security_invoker`
unset **and** `anon`/`authenticated` grants, so anon read it with the owner's
rights and RLS on the underlying tables did not apply.

Both get the two-part fix from `20260810201000` — revoke from `public` *and* from
`anon, authenticated` separately, since a Supabase `ALTER DEFAULT PRIVILEGES`
direct grant is not a PUBLIC grant — plus RLS on the table and
`security_invoker` on the view. `service_role` grants are preserved explicitly:
it carries `rolbypassrls` but not `rolsuper`, so BYPASSRLS would not have saved it.

### `20260822143505_arkansas_river_hazards.sql`

The first hazards on any Arkansas river. Before this, all 19 in the catalog were
Missouri and all 7 AR rivers had zero — the one real gap the audit surfaced, and
the one it filed as a per-river footnote underneath the duplicate access points.

Four rows: Kings' blasted-out low-water bridge above Marshall Ford, and the
Mulberry's Sacroiliac Rapid, Hamm Falls and Hell Roaring Falls.

*(The audit called the Mulberry rapid "The SAC". It is **Sacroiliac Rapid**, per
turnerbend.com — the audit's own cited source.)*

**On placement.** None of the four has a published coordinate; every source
locates them the way a paddler does ("two miles below Redding", "the 10 mile
mark"). `00173`'s footer interpolates along a straight chord between bracketing
access points, which on these sinuous rivers puts the four hazards **176 m,
489 m, 627 m and 1,040 m off the water**. What shipped instead keeps `00173`'s
calibration idea and places the point on the river:

```sql
frac  = a_f + ((m - a_m) / (b_m - a_m)) * (b_f - a_f)   -- a_f,b_f via ST_LineLocatePoint
point = ST_LineInterpolatePoint(ST_LineMerge(r.geom), frac)
```

All four land at **0.0 m** off the line. The migration recomputes at apply time
and asserts the result is within 150 m of the reviewed position, so an improved
geometry yields an improved pin but a moved geometry aborts rather than silently
repositioning a safety marker.

**On idempotency.** Not `DELETE`+`INSERT`, despite `00173`. `community_reports.
hazard_id → river_hazards(id) ON DELETE SET NULL` means a re-run would silently
detach user-submitted reports from their hazard — no error, no trace — and
`/api/admin/hazards/[id]` `PUT` means an operator's edits would be reverted too.
`INSERT ... WHERE NOT EXISTS` instead — and nothing else.

An earlier draft paired that insert with an unconditional `UPDATE` on the same
natural key, believing it made re-running idempotent. Review caught that it did
the opposite. Because these four rows are new, the `UPDATE` matched nothing on a
first apply; the only time it could ever fire was a replay, where it would reset
`type`, `severity`, `location`, `description`, `portage_side`, `active` and
`updated_at` to the file's values — silently reverting any operator correction
made through `/api/admin/hazards/[id]` in between. A bridge marked `active=false`
after being rebuilt would come back on. Zero value on the path that runs,
negative value on the path that does not.

The assertions moved with it: the geometry checks now test the **staged**
positions this migration computes rather than the stored rows, so a legitimate
field correction cannot trip the 150 m tripwire and block a replay; and the
presence checks count rows rather than *active* rows, since switching a hazard
off is an operator decision, not a regression.

### `20260822143610_arkansas_river_characteristics.sql`

The reach-level material, which was never point-shaped. Fills
`rising_water_hazards` on mulberry and kings-river and `low_water_meaning` on
mulberry — all NULL before, and all read into river context by
`src/lib/rivers/context.ts:110` for `src/lib/eddy/generate-update.ts`.

`primary_hazards` is untouched: it already carried the substance of the audit's
reach-level claims on every AR river (crooked-creek
`{strainer,gravel_bar,flash_flood}`, caddo `{rapid,strainer,flash_flood}`).

## What was deliberately not landed

**No access points at all.** The four genuinely-new ones have no published
coordinate, and unlike a rapid they cannot be derived — a put-in is a road-end,
not a point on the river line. An access point is the record that sends someone
driving; a guessed one is worse than an absent one.

**No new services.** `unverified` is a *displayed* state, not a hidden one —
`src/app/api/services/route.ts:45` is explicit that `serviceEligible` draws those
rows and that "unverified means nobody has re-confirmed the listing". Adding two
businesses nobody checked in this pass would publish unvetted third-party
listings.

**No Arrowhead link.** The plan had been to model it as
`access_point_services(relationship = 'located_at')`. The data says otherwise:
the nearest Caddo access point is **2,227 m** from the Arrowhead service, and
`located_at` means "same facility, different arrival point". It is its own
private put-in, not an arrival point for an existing access.

**No War Eagle Hwy 45 or Gar Hole demotion.** See below.

**No `rivers.length_miles` change on war-eagle-creek.** `20260805190000`
investigated the 33.17-against-68.10-mile discrepancy, concluded the *line* is
the suspect rather than the column, deliberately left it, and added an assertion
that fails if it moves. What it needs is a geometry re-import with correct NHD
reach assembly — separate work, and someone has to look at a map.

## Research queue

Nothing here is blocked on analysis; each item needs one phone call, one agency
page, or one field fix.

| item | what it needs | why it is not resolved |
| --- | --- | --- |
| Mulberry — AR Hwy 103 near Oark | road-end coordinate | no published coordinate found |
| Mulberry — Little Mulberry | road-end coordinate | as above |
| Mulberry — Milton Ford | road-end coordinate | as above |
| Crooked Creek — George's Creek (added 2017) | road-end coordinate | as above; AGFC has the access, not the point |
| Eddy-Out Outfitters (Kings) | phone confirmation | audit rates MEDIUM; not checked this pass |
| Kings River Country Store | phone confirmation — reported (479) 665-2323, 22784 Hwy 412, Huntsville | as above |
| War Eagle Hwy 45 bridge | current AGFC / Madison County status | audit's only evidence is a 2008 newspaper article. Searches surfaced only the unrelated historic War Eagle Mill bridge in Benton County. Production has it `is_public=true`; note that "War Eagle Canoeing & Camping" sits ~1.5 km away and is listed active, which cuts against a hard closure |
| Gar Hole low-water crossing | same | audit says "access restricted, no parking"; production has it Benton County / public |
| Rockhouse coordinate | agency source or field GPS | 1,343 m discrepancy, production currently favoured |
| `kings-river.low_water_meaning` | confirm the ~3.2 ft Berryville minimum | audit attributes it to Kings River Outfitters; unconfirmed, and it feeds generated user-facing copy |

Also standing: **45 of 156 services have `last_verified_at IS NULL`** and 18 have
no coordinates, while 149 carry `status='active'`. These are overlapping but
distinct sets — flipping the unverified-timestamp rows would degrade at most 45
listings, not 149. Neither was done here.

```sql
select name, city, phone, status, last_verified_at, latitude is null as no_coords
from nearby_services
where last_verified_at is null or latitude is null
order by status, name;
```

## Applied 2026-08-22 — what ran and what it produced

All three migrations were applied to the FloatMe project
(`ilefwfpvphadsbptiaur`) on 2026-08-22 via the management API, on explicit
instruction. Each ran inside one transaction with its assertions; any raise
would have rolled the whole migration back.

**Recorded versions differ from the dates they were authored under.** The
management API stamps a migration with the time it is applied, so production
recorded `20260822143308`, `20260822143505` and `20260822143610`. The three
files were renamed to match, because `scripts/check-migration-drift.ts`
enforces exact local==remote equality past the legacy baseline and would
otherwise report six phantom entries — three local with no remote, three remote
with no local. Each header records the name it was renamed from.

Verified after applying, independently of the migrations' own assertions:

| check | result |
| --- | --- |
| ACL role test — `anon` / `authenticated` on both objects | `false` on SELECT, DELETE, TRUNCATE, and on the view |
| ACL role test — `service_role` / `postgres` | `true` throughout, so the dam-history path still works |
| `get_advisors(type: security)` ERROR-level findings | **0** (was 2) |
| `rls_disabled_in_public` occurrences | 0 |
| `gauge_snap_diagnostics` occurrences | 0 |
| Arkansas hazards | 4, all `active`, all **0.0 m** off their river line |
| `river_characteristics` prose | mulberry (both fields) and kings-river (rising only), as scoped |
| rivers deliberately left alone | crooked-creek, caddo-river, war-eagle-creek still null |

`dam_history_backfill_marks` still appears in the advisor output three times,
now at **INFO** as `rls_enabled_no_policy`. That is the intended end state, not
a regression: RLS on with zero policies is what denies `anon` and
`authenticated` while `postgres` and `service_role` pass on `BYPASSRLS`.

`npm run db:correct-miles` was **not** run and is not needed — no access points
were added.

Still outstanding for a proper checkout, since this container could not run them
(Node 22 against a pinned Node 20, no `node_modules`, no Supabase CLI):

1. `npm run db:check-migrations` — should now report a match, given the renames.
2. `make check-web` on Node 20.
3. `GET /api/rivers/mulberry/hazards` — expect three rows with non-zero
   coordinates; Kings carries the fourth.

## Reproduce the diff

The query the audit said it could not run. Anyone commissioning the next one
should run this first and hand the output to the researcher.

```sql
select r.slug, r.name, r.state,
  (select count(*) from access_points a where a.river_id = r.id) as accesses,
  (select count(*) from access_points a
     where a.river_id = r.id and a.location_orig is null) as accesses_without_geometry,
  (select count(*) from river_hazards h where h.river_id = r.id) as hazards,
  (select count(*) from river_gauges g where g.river_id = r.id) as gauges,
  (select count(*) from service_rivers sr where sr.river_id = r.id) as services
from rivers r
order by r.state nulls first, r.slug;
```

And the duplicate screen that caught the J.D. Fletcher error — note it was
**distance to a differently-named row** that did it. Name matching alone would
have missed it; distance alone over-flags, since two legitimate accesses can sit
within 200 m. Both are needed, as a review gate rather than an invariant.

```sql
-- for each proposed (lat, lon) on a river, the nearest existing access point
select a.name, a.slug,
  round(ST_Distance(a.location_orig::geography,
        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)::numeric, 0) as metres
from access_points a
join rivers r on r.id = a.river_id
where r.slug = :slug
order by metres
limit 5;
```
