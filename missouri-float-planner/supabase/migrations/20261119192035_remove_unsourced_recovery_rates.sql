-- 20261119192035_remove_unsourced_recovery_rates.sql
--
-- Applied to production 2026-11-19 as 20261119192035, on the owner's word
-- ("delete all eight"). Read back afterwards: no river carries a
-- drop_rate_note, and the ten river notes beside them are untouched. Written
-- as 20261119200000 and renamed to the version production recorded. The
-- statement production holds is the `do` block below under a shorter comment.
--
-- Clears river_characteristics.drop_rate_note on eight rivers, and only on
-- those eight, and only while each still holds the text recorded here.
--
-- Each was a hand-set rate at which the river falls after high water
-- ("0.3-0.6 ft/day"), seeded with the rain-lag estimates in 00145 and, like
-- them, with no recorded source. The lag estimates were measured and found
-- well off (scripts/research/rain-lag-2026-11) and were cleared in
-- 20261119184409. The owner chose to delete these too, on 2026-11-19.
--
-- What they did: one line, "Recovery rate: ...", in the river Read's prompt,
-- with an instruction to use it for tone only and never to quote it. Over the
-- three days before this was written, 30 of 77 river Reads were given the
-- line and none quoted a rate. Nothing else read the column: not the
-- condition, float times, alerts, the weather section, chat or gauge Reads.
-- The Read is already given the gauge's measured change over 6 and 24 hours,
-- which is how fast the river is actually dropping today.
--
-- One of the eight carried something that read like local knowledge: the
-- Meramec's "floatable above Hwy 8 ~36h after rain stops". The owner was
-- asked whether to keep it as a note in the knowledge file and chose to
-- delete all eight.
--
-- Scope. A row is cleared when its river and its text both match the list
-- below, as read from production on 2026-11-19. A river not on the list, or a
-- listed river whose text has since been changed, is left as it is. The
-- statement then checks that nothing on the list still holds its old text.
--
-- The application stopped reading the column in the same change. Code still
-- running the older version reads a NULL and leaves the line out of the
-- prompt, so this is safe to apply before or after that deploy. The column
-- stays.

do $$
declare
  cleared integer;
  remaining integer;
begin
  create temporary table legacy_recovery_rate (slug text primary key, note text not null) on commit drop;
  insert into legacy_recovery_rate (slug, note) values
    ('big-piney', '0.3-0.6 ft/day (lower volume, steady spring base)'),
    ('courtois', '1-2 ft/day (similar to Huzzah)'),
    ('current', '0.2-0.4 ft/day (slow, large spring base flow)'),
    ('eleven-point', '0.3-0.6 ft/day (Greer Spring stabilizes)'),
    ('huzzah', '1-2 ft/day (small watershed drains fast)'),
    ('jacks-fork', '1-3 ft/day (drops as fast as it rises)'),
    ('meramec', '0.5-2 ft/day (floatable above Hwy 8 ~36h after rain stops)'),
    ('niangua', '0.3-0.5 ft/day (Bennett Spring stabilizes)');

  update public.river_characteristics rc
  set drop_rate_note = null
  from public.rivers r
  join legacy_recovery_rate legacy on legacy.slug = r.slug
  where rc.river_id = r.id
    and rc.drop_rate_note = legacy.note;
  get diagnostics cleared = row_count;

  select count(*) into remaining
  from public.river_characteristics rc
  join public.rivers r on r.id = rc.river_id
  join legacy_recovery_rate legacy on legacy.slug = r.slug
  where rc.drop_rate_note = legacy.note;
  if remaining <> 0 then
    raise exception 'recovery rates: % listed rows still hold their old text', remaining;
  end if;

  raise notice 'recovery rates: cleared % of 8 listed rivers', cleared;
end $$;
