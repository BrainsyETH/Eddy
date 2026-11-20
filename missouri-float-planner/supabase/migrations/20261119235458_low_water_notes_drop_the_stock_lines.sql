-- 20261119235458_low_water_notes_drop_the_stock_lines.sql
--
-- Applied to production 2026-11-19 as 20261119235458, on the owner's word
-- ("Apply to production now"). Read back afterwards: all nine rows hold their
-- new text and no river's note mentions lighter craft or rafts. Written as
-- 20261119233000 and renamed to the version production recorded. The statement
-- production holds is the `do` block below under a shorter comment.
--
-- Rewrites river_characteristics.low_water_meaning on nine rivers, and only
-- on those nine, and only while each still holds the text recorded here.
--
-- What the column does. It is curated prose about what low water means on a
-- river, and the Read prompt is its only reader: buildConditionSemantics()
-- puts it in the [CONDITION SEMANTICS] block as "On this river, low water
-- means: ...". No page, API response, chat tool or iOS screen shows it.
--
-- Why these rows.
--
-- 1. The lighter-craft line. Eight rivers end with "lighter craft handle it
--    better than rafts". Seven of them hold one identical sentence, seeded in
--    00145 from the spring-fed default, so it is not a note about any one
--    river. On 2026-11-19, 7 of 24 river Reads told the reader that lighter
--    boats beat rafts. The shared Read brief (src/lib/eddy/read-brief.ts)
--    names that line as not news, and the type default stopped asking for it
--    in the same change, but a Read on these rivers was still handed it here.
--
-- 2. Level numbers on the Mulberry. Its note quoted "about 1.5 ft at Turner
--    Bend" and "1.5-1.7 ft is the beginner band". The gauge's whole ladder is
--    now in the prompt from river_gauges, so the note was a second set of
--    numbers beside it, and on 2026-11-19 the Read quoted it to readers as
--    what "Turner Bend outfitters typically peg". EDDY_KNOWLEDGE.md's Format
--    Rules already say this of the knowledge file: say what the number means,
--    do not restate it. What the note knew that the ladder does not is kept:
--    the whitewater reaches upstream need more water.
--
-- The North Fork's note ("below ~285 cfs the riffles get scrapy") is the same
-- kind of line and is rewritten with its ladder, in 20261119235608.
--
-- Scope. A row is rewritten when its river and its text both match the list
-- below, as read from production on 2026-11-19. A river not on the list, or a
-- listed river whose text has since been changed, is left as it is. The
-- statement then checks that nothing on the list still holds its old text.
-- Safe to apply before or after the code that ships with it.

do $$
declare
  rewritten integer;
  remaining integer;
begin
  create temporary table stock_low_water (slug text primary key, was text not null, becomes text not null) on commit drop;
  insert into stock_low_water (slug, was, becomes)
  select slug,
    'Scraping on gravel bars, dragging over shallow spots, and picking your line through riffles. Floatable, and lighter craft handle it better than rafts.',
    'Scraping on gravel bars, dragging over shallow spots, and picking your line through riffles. Floatable.'
  from unnest(array['courtois', 'current', 'eleven-point', 'huzzah', 'jacks-fork', 'meramec', 'niangua']) as slug;
  insert into stock_low_water (slug, was, becomes) values
    ('black',
     'upper-lesterville: Low water means boats drag on most riffles, but the reach stays floatable; lighter craft handle it better than rafts.',
     'upper-lesterville: Low water means boats drag on most riffles, but the reach stays floatable.'),
    ('mulberry',
     'Below about 1.5 ft at Turner Bend the Mulberry turns scrapy and the run becomes a walk. 1.5-1.7 ft is the beginner band; the whitewater reaches need more.',
     'In low water the Mulberry turns scrapy and the run becomes a walk. The whitewater reaches upstream need more water than the lower river.');

  update public.river_characteristics rc
  set low_water_meaning = stock.becomes
  from public.rivers r
  join stock_low_water stock on stock.slug = r.slug
  where rc.river_id = r.id
    and rc.low_water_meaning = stock.was;
  get diagnostics rewritten = row_count;

  select count(*) into remaining
  from public.river_characteristics rc
  join public.rivers r on r.id = rc.river_id
  join stock_low_water stock on stock.slug = r.slug
  where rc.low_water_meaning = stock.was;
  if remaining <> 0 then
    raise exception 'low-water notes: % listed rows still hold their old text', remaining;
  end if;

  raise notice 'low-water notes: rewrote % of 9 listed rivers', rewritten;
end $$;
