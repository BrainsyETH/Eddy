-- 20261117013100_backfill_nws_flood_stages_on_linked_gauges.sql
--
-- Twelve linked gauges have an official NWS flood stage that no condition
-- reader can see. This stores it where 00165 stored the others: the NWS id on
-- the station, the flood and action stage on the river_gauges pairing.
--
-- ── Why they were missed ────────────────────────────────────────────────────
-- A curated gauge gets its stages from scripts/fetch-nws-flood-stages.ts,
-- which needs the station's nws_lid or a discovery call that has returned an
-- empty list since 2026-07 (see scripts/import-nwps-gauges.ts). Nine of these
-- stations have never had a lid, and Patterson has one with no stage written.
-- Calico Rock and Rich Fountain were imported as national reference stations
-- before they were curated, so their stage sits on the station row, where the
-- safety display reads it and condition logic did not.
--
-- ── What it costs to leave ──────────────────────────────────────────────────
-- Six of the twelve are unrated or have no dangerous level, so the flood
-- stage is the only danger signal Eddy has for them:
--
--   07052250  James near Boaz           ladder is too-low 80 and good-from 150
--                                       cfs only. At June 2026's peak (14.58
--                                       ft, 16,600 cfs) gradeReading returns
--                                       'good'; with the 10 ft stage,
--                                       'dangerous'.
--   07069500  Spring River at Imboden   unrated: 'unknown' in flood
--   07186000  Spring River near Waco    unrated: 'unknown' in flood
--   07037500  St. Francis at Patterson  unrated: 'unknown' in flood
--   06934000  Gasconade, Rich Fountain  unrated: 'unknown' in flood
--   07060500  White at Calico Rock      unrated: 'unknown' in flood
--
-- No missed event was found. Boaz, Patterson, Byrnesville and Galena each
-- exceeded these stages during 2026, on dates before their pairings existed
-- (created 2026-07-12 to 2026-07-14).
--
-- ── Source and checks, 2026-11-17 ───────────────────────────────────────────
-- National Water Prediction Service, api.water.noaa.gov/nwps/v1/gauges/{USGS
-- id}, flood.categories.action and .minor, stageUnits 'ft'. Each row was
-- accepted only when:
--   1. NWPS reports the same usgsId for the lid (the cross-check
--      fetch-nws-flood-stages.ts makes), and
--   2. NWPS's latest observed stage equals the USGS gage height Eddy stores
--      for the same quarter hour, so the stage is on the scale readings use.
--
--   USGS id   lid    action  flood  NWPS obs / Eddy reading (ft)
--   07018500  BYRM7  13      16     1.85 / 1.85   Big River at Byrnesville
--   07058000  TBCM7  14      16     3.56 / 3.56   Bryant Creek near Tecumseh
--   07052250  JAMM7   8      10     2.38 / 2.37   James near Boaz (15 min apart)
--   07052500  GLNM7  11      15     3.78 / 3.78   James at Galena
--   07050500  BRYA4  30      31     2.81 / 2.81   Kings near Berryville
--   07252000  MLBA4  10      18     1.03 / 1.03   Mulberry near Mulberry
--   07069500  IMBA4  13      18     2.75 / 2.75   Spring River at Imboden
--   07185765  CHTM7   8      10     2.48 / 2.48   Spring River at Carthage
--   07186000  WCOM7  15      19     0.98 / 0.98   Spring River near Waco
--   07037500  PAZM7  10      16     4.65 / 4.65   St. Francis at Patterson
--   06934000  RIFM7  18      20     2.04 / 2.04   Gasconade near Rich Fountain
--   07060500  CLRA4  16      19     4.14 / 4.14   White at Calico Rock
--
-- ── Deliberately not written ────────────────────────────────────────────────
--   07057500  North Fork near Tecumseh (TNZM7, flood 20). Check 2 fails: NWPS
--             reads 0.41 ft above USGS at the same time (2.53 / 2.12, and
--             2.52 / 2.11 an hour later). The published stage is on a
--             different scale from the readings it would be compared with.
--             It needs a person to confirm the offset. The gauge is rated, so
--             its dangerous level (2,200 cfs) still answers far below flood.
--   07018100  Big River near Richwoods (RCHM7), 07010350 Meramec at Cook
--             Station (CSNM7): action stage only. 07014000 Huzzah (HZHM7): no
--             category. A gauge with no minor-flood stage is not published as
--             a flood-stage station (src/lib/gauges/flood-stages.ts).
--
-- ── What it does not touch ──────────────────────────────────────────────────
-- level_* ladders, threshold_source and the station's nwps_* columns. The
-- stage goes on the pairing because that is what fetch-nws-flood-stages.ts
-- maintains for a curated gauge; the national import never refreshes a
-- curated station's nwps_* columns.
--
-- ── Guards ──────────────────────────────────────────────────────────────────
-- One DO block, so it applies whole or not at all. It refuses to replace a
-- different lid, a different pairing stage, or a station nwps stage that
-- disagrees with the value here; it requires every station to exist and be
-- linked, unless none exists (an unseeded database, where it does nothing).
-- Re-running it changes nothing.
--
-- ── Effect on apply ─────────────────────────────────────────────────────────
-- No verdict changes: every gauge reads at least 7.5 ft below its flood stage
-- (closest: Carthage, 2.48 of 10). The next time one of them reaches flood
-- stage, the condition functions, the gauge cron, alerts and the Read
-- classify it 'dangerous', as the gauges 00165 staged already do.

DO $$
DECLARE
  r record;
  v_station record;
  v_found integer := 0;
  v_expected integer := 0;
  v_links integer;
  v_conflict numeric;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('07018500', 'BYRM7', 13::numeric, 16::numeric),
      ('07058000', 'TBCM7', 14, 16),
      ('07052250', 'JAMM7', 8, 10),
      ('07052500', 'GLNM7', 11, 15),
      ('07050500', 'BRYA4', 30, 31),
      ('07252000', 'MLBA4', 10, 18),
      ('07069500', 'IMBA4', 13, 18),
      ('07185765', 'CHTM7', 8, 10),
      ('07186000', 'WCOM7', 15, 19),
      ('07037500', 'PAZM7', 10, 16),
      ('06934000', 'RIFM7', 18, 20),
      ('07060500', 'CLRA4', 16, 19)
    ) AS t(usgs_site_id, lid, action_ft, flood_ft)
  LOOP
    v_expected := v_expected + 1;

    SELECT gs.id, gs.nws_lid, gs.nwps_flood_stage_ft
      INTO v_station
      FROM public.gauge_stations gs
     WHERE gs.usgs_site_id = r.usgs_site_id;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    v_found := v_found + 1;

    IF v_station.nws_lid IS NOT NULL AND v_station.nws_lid <> r.lid THEN
      RAISE EXCEPTION 'flood backfill: % already carries lid %, not %',
        r.usgs_site_id, v_station.nws_lid, r.lid;
    END IF;
    IF v_station.nwps_flood_stage_ft IS NOT NULL AND v_station.nwps_flood_stage_ft <> r.flood_ft THEN
      RAISE EXCEPTION 'flood backfill: % station flood stage is %, not %',
        r.usgs_site_id, v_station.nwps_flood_stage_ft, r.flood_ft;
    END IF;

    SELECT count(*), max(rg.flood_stage_ft) FILTER (WHERE rg.flood_stage_ft <> r.flood_ft)
      INTO v_links, v_conflict
      FROM public.river_gauges rg
     WHERE rg.gauge_station_id = v_station.id;
    IF v_links = 0 THEN
      RAISE EXCEPTION 'flood backfill: % is not linked to a river', r.usgs_site_id;
    END IF;
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'flood backfill: % pairing already carries flood stage %, not %',
        r.usgs_site_id, v_conflict, r.flood_ft;
    END IF;

    UPDATE public.gauge_stations
       SET nws_lid = r.lid
     WHERE id = v_station.id AND nws_lid IS NULL;

    UPDATE public.river_gauges
       SET flood_stage_ft = r.flood_ft,
           action_stage_ft = r.action_ft
     WHERE gauge_station_id = v_station.id
       AND flood_stage_ft IS NULL;
  END LOOP;

  IF v_found = 0 THEN
    RAISE NOTICE 'flood backfill: none of the % stations exist here; nothing to do', v_expected;
    RETURN;
  END IF;
  IF v_found <> v_expected THEN
    RAISE EXCEPTION 'flood backfill: found % of % stations', v_found, v_expected;
  END IF;
END
$$;
