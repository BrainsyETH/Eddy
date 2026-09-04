-- A spring is a spring, and a cabin is not.
--
-- ── WHY ───────────────────────────────────────────────────────────────────
--
-- `points_of_interest` is about to become a map layer rather than a list on a
-- river page, and a `type` that was merely untidy while it drove an icon in a
-- sidebar becomes a wrong pin on a map. Auditing the eight rows typed `spring`
-- and everything else carrying "Spring" in its name turned up four problems,
-- all of them visible the moment a springs layer draws:
--
--   1. Granny Henderson's Cabin (Buffalo River, mile 27.7) is typed `spring`.
--      It is a preserved homestead cabin — the best-known building on the
--      Buffalo — and nothing about it is a spring.
--
--   2. Alley Spring and Mill exists TWICE: once correctly attached to the Jacks
--      Fork at mile 31 but typed `historical_site`, and once as an orphan typed
--      `spring` with no river, no mile, inactive and flagged off-water. Neither
--      row can be drawn: the first is not a spring, the second belongs to no
--      river. Alley Spring is the tenth largest spring in Missouri.
--
--   3. Devils Well has the same three faults as that orphan — no river,
--      inactive, `is_on_water = false` — so it is invisible to every query in
--      the app. It sits in the Current River basin.
--
--   4. Big Spring and Welch Spring on the Current are typed `cave`. Both have
--      caves; both ARE springs, and Big Spring is one of the largest in the
--      world. `type` is single-valued here, so the cave reading loses: the
--      spring is why anyone goes.
--
-- ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────
--
-- Devils Well is deliberately left INACTIVE. It is a sinkhole and cave lake
-- roughly a mile from the Current, reached by road and not by water, so it
-- fails `is_on_water` honestly — the river-POI endpoint's filter is right to
-- exclude it, and forcing it on-water to make it draw would put a pin on the
-- river bank for something a mile inland. It gets its river and its type here
-- so it stops being an orphan; whether Eddy carries off-water landmarks at all
-- is a product question this migration does not answer.
--
-- Every statement below is keyed by name and current type so that re-running it
-- after a correction cannot re-break the row.

-- 1. A cabin is not a spring. It is the homestead the Buffalo is known for.
update points_of_interest
   set type = 'historical_site',
       updated_at = now()
 where name = 'Granny Henderson''s Cabin'
   and type = 'spring';

-- 2. Alley Spring: the attached row becomes the spring it is, and the orphan
--    duplicate is retired rather than deleted — it may carry images or text
--    somebody wrote, and `active = false` is how this table already says "not
--    on the map" (see the six inactive rows it arrived with).
update points_of_interest
   set type = 'spring',
       updated_at = now()
 where name = 'Alley Spring and Mill'
   and river_id = (select id from rivers where slug = 'jacks-fork')
   and type = 'historical_site';

update points_of_interest
   set active = false,
       description = coalesce(description, '') ||
         case when coalesce(description, '') = '' then '' else ' ' end ||
         '(Superseded by the Jacks Fork River record for Alley Spring.)',
       updated_at = now()
 where name = 'Alley Spring and Mill'
   and river_id is null;

-- 3. Devils Well belongs to the Current River basin. Left inactive and
--    off-water on purpose — see the note above.
update points_of_interest
   set river_id = (select id from rivers where slug = 'current'),
       updated_at = now()
 where name = 'Devils Well'
   and river_id is null;

-- 4. A spring with a cave in it is still a spring. Both of these are drawn by
--    the spring layer or by nothing.
update points_of_interest
   set type = 'spring',
       updated_at = now()
 where type = 'cave'
   and river_id = (select id from rivers where slug = 'current')
   and name in ('Big Spring', 'Welch Spring and Hospital');

-- ── Provenance for derived positions ──────────────────────────────────────
--
-- `scripts/ingestion/snap-springs.ts` writes springs whose coordinates are
-- INTERPOLATED from a river mile between two access points, not surveyed. That
-- distinction has to survive into the app — a reader is owed the difference
-- between "this is where Round Spring is" and "this is roughly where the guide
-- says Falling Spring is" — and it has to survive a later editor opening the
-- row, which a note buried in `raw_data` would not.
--
-- Nullable, with no default: an existing row has a position somebody placed by
-- hand or took from NPS, and stamping every one of them 'derived' to make the
-- column total would be a lie about 51 rows to save one `is null` check.
alter table points_of_interest
  add column if not exists position_source text
    check (position_source in ('surveyed', 'derived_from_river_mile'));

comment on column points_of_interest.position_source is
  'How latitude/longitude were obtained. NULL means hand-placed or from the '
  'source that supplied the row. ''derived_from_river_mile'' means interpolated '
  'along the river line between access points by scripts/ingestion/snap-springs.ts, '
  'and is accurate to roughly the spacing of those access points — see '
  'raw_data.bracket_miles on the row.';
