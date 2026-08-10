-- Six services are filed against a river they are not on, and one sells a boat
-- it no longer rents.
--
-- ── How these were found, and why it matters that they were found mechanically ─
--
-- Every service pin written on 2026-08-07/09 was checked by hand against the
-- river the service is linked to, because a coordinate that lands nowhere near
-- the water a business serves is almost always wrong. Running that same check
-- across all 138 located rows turns up six where the nearest river is NOT one
-- the service is linked to. All six are real defects; none is a false positive.
--
-- That is the argument for the trust check landing alongside this migration:
-- the rule was already good enough to catch these, it was just being run by a
-- person who had to remember to run it.
--
-- ── TWO ARE WRONG LINKS. FOUR ARE MISSING ONES. ───────────────────────────
--
-- The distinction decides the statement, so it is worth stating plainly.
--
-- Gasconade Hills Resort and Froggy's River Resort are recorded against the Big
-- Piney and sit 17.30 and 15.12 miles from it — but 0.11 and 0.20 miles from the
-- GASCONADE, on exact-name OSM matches. One of them is named for the river it
-- is actually on. The Big Piney link is simply false, so it is REPLACED.
-- 20260807203000 measured both of these and deliberately left the correction to
-- its own change with its own evidence. This is that change.
--
-- The four Arkansas rows are different. Wild Bill's Outfitter, Crooked Creek
-- Adventures and Buffalo River Float Service are Yellville storefronts 8.3 to
-- 10.6 miles from Crooked Creek and 1.3 to 3.2 from the Buffalo; Float Eureka is
-- a Huntsville shop 13.4 miles from War Eagle Creek and 4.6 from the Kings. An
-- Ozarks outfitter routinely runs two waters, and "Buffalo River Float Service"
-- is currently linked to Crooked Creek and NOT to the river in its own name.
-- Dropping the existing link to add the missing one would delete a true fact to
-- fix an absent one, so these are ADDED.
--
-- ── Song Dog Shuttles ─────────────────────────────────────────────────────
--
-- Still records `kayak_rental` alongside `shuttle`. The operator's own site says
-- they stopped renting in 2023 and now run shuttles only. A paddler who books a
-- boat from a shuttle company has a bad day, and this is the whole fix — there
-- is no need for a service-mode column, because `services_offered` is what
-- `serviceOffers()` already reads and what ShuttlePanel already filters on.
--
-- Song Dog has no coordinates (its 2026-08-07 candidate resolved to a different
-- company's building and was refused), so it is outside the geo check's scope
-- entirely. The offerings fix is independent of that unresolved identity.
--
-- ── After this ────────────────────────────────────────────────────────────
--
-- The nearest-river divergence query returns zero rows, and the furthest any
-- located service sits from a river it serves is 6.54 miles — Eleven Point
-- Cottages, a lodge in Alton town, which is correct data.

BEGIN;

-- ── Wrong links: replace ──────────────────────────────────────────────────

-- Gasconade Hills Resort — 17.30 mi from the Big Piney, 0.11 from the Gasconade.
UPDATE service_rivers
   SET river_id = (SELECT id FROM rivers WHERE name = 'Gasconade River')
 WHERE service_id = 'faea7b2c-1411-44b1-b86e-b35715586213'
   AND river_id = (SELECT id FROM rivers WHERE name = 'Big Piney River');

-- Froggy's River Resort — 15.12 mi from the Big Piney, 0.20 from the Gasconade.
UPDATE service_rivers
   SET river_id = (SELECT id FROM rivers WHERE name = 'Gasconade River')
 WHERE service_id = 'f652e50c-8b88-4e36-8052-ef8d69ee9045'
   AND river_id = (SELECT id FROM rivers WHERE name = 'Big Piney River');

-- ── Missing links: add, keeping what is already true ──────────────────────

-- Wild Bill's Outfitter, Yellville — 1.26 mi from the Buffalo.
INSERT INTO service_rivers (service_id, river_id)
SELECT '35f57ec0-239d-4058-95d1-54332a8afef8', r.id FROM rivers r
 WHERE r.name = 'Buffalo National River'
   AND NOT EXISTS (SELECT 1 FROM service_rivers sr
                    WHERE sr.service_id = '35f57ec0-239d-4058-95d1-54332a8afef8'
                      AND sr.river_id = r.id);

-- Crooked Creek Adventures, Yellville — 2.17 mi from the Buffalo.
INSERT INTO service_rivers (service_id, river_id)
SELECT '1a8422f6-9d3f-47b0-a2a5-2740cb2e7d87', r.id FROM rivers r
 WHERE r.name = 'Buffalo National River'
   AND NOT EXISTS (SELECT 1 FROM service_rivers sr
                    WHERE sr.service_id = '1a8422f6-9d3f-47b0-a2a5-2740cb2e7d87'
                      AND sr.river_id = r.id);

-- Buffalo River Float Service, Yellville — 3.17 mi from the river it is named for.
INSERT INTO service_rivers (service_id, river_id)
SELECT 'bbb7e6c9-58f7-4cf2-a265-f599a62f5b0a', r.id FROM rivers r
 WHERE r.name = 'Buffalo National River'
   AND NOT EXISTS (SELECT 1 FROM service_rivers sr
                    WHERE sr.service_id = 'bbb7e6c9-58f7-4cf2-a265-f599a62f5b0a'
                      AND sr.river_id = r.id);

-- Float Eureka, Huntsville — 4.63 mi from the Kings, 13.39 from the War Eagle.
INSERT INTO service_rivers (service_id, river_id)
SELECT 'e4e7ac0b-5375-4120-9aab-19457f9b823b', r.id FROM rivers r
 WHERE r.name = 'Kings River'
   AND NOT EXISTS (SELECT 1 FROM service_rivers sr
                    WHERE sr.service_id = 'e4e7ac0b-5375-4120-9aab-19457f9b823b'
                      AND sr.river_id = r.id);

-- ── Song Dog Shuttles: shuttle only since 2023 ────────────────────────────
--
-- Set explicitly rather than array_remove'd: a reader sees the intended end
-- state instead of having to know the prior value to work it out.
UPDATE nearby_services
   SET services_offered = ARRAY['shuttle']::service_offering[]
 WHERE id = '13fa7656-8f8a-4e70-a0f8-1ac0b47e7b9c';

COMMIT;
