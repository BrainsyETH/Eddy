-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-11-01 and RECORDED as
-- 20261101161525; authored as 20261101190000 and renamed to the recorded
-- version. Ledger: supabase/production-migrations.txt.
--
-- Pre-apply state matched the 00005 seed (kayak 2.5 / 3.0 / 4.0, canoe
-- 2.0 / 2.5 / 3.5). Post-apply: kayak and canoe both 2.0 / 2.5 / 3.5.
--
-- A kayak floats at canoe pace: 2.0 / 2.5 / 3.5 mph (low / normal / high water).
--
-- 00005 seeded the kayak at 2.5 / 3.0 / 4.0 and described it as the "Fastest
-- option", which quoted a kayak about 20% faster than a canoe on every modeled
-- estimate (a 10-mile "flowing" day trip: ~4 h 10 m by kayak, ~5 h by canoe).
-- Nothing sourced that gap, and the published-time path already disagreed:
-- get_segment_float_time (00011) and publishedTiming in
-- src/lib/agent-tools/candidate-duration.ts both give a kayak the canoe's
-- times. The same trip therefore changed speed depending on which path ran.
--
-- For the boats people rent on Ozark streams (16–17 ft tandem canoes, ~10 ft
-- sit-on-top kayaks), current and stops dominate trip time, not the hull.
-- Until calibration data shows a real difference, the kayak takes the canoe's
-- speeds, which also match DEFAULT_CANOE_SPEEDS in
-- src/lib/calculations/floatTime.ts.
--
-- Data only: no schema change, so src/types/database.ts is unaffected.

update public.vessel_types
set speed_low_water = 2.0,
    speed_normal = 2.5,
    speed_high_water = 3.5,
    description = 'Single or tandem kayak. Floats at about canoe pace.'
where slug = 'kayak';

do $$
declare
  mismatched int;
begin
  select count(*) into mismatched
  from public.vessel_types k
  join public.vessel_types c on c.slug = 'canoe'
  where k.slug = 'kayak'
    and (k.speed_low_water, k.speed_normal, k.speed_high_water)
        is distinct from (c.speed_low_water, c.speed_normal, c.speed_high_water);
  if mismatched > 0 then
    raise exception 'kayak speeds do not match canoe speeds after update';
  end if;
end $$;
