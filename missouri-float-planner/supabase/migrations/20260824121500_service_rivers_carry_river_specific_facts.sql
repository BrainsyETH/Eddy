-- A business that serves two rivers does not serve them identically.
--
-- APPLIED to production 2026-08-24 as 20260824121500.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
--
-- nearby_services.services_offered belongs to the business. service_rivers
-- recorded only membership. Between them they quietly assert that every rental
-- and shuttle a business lists applies on every river it is linked to, and this
-- directory is full of counter-examples found while researching it:
--
--   Bass' River Resort   sells 6-, 7- and 13-mile Courtois runs between
--                        Berryman, Blunts, Bass' and Scotia, plus multi-day
--                        trips of 20 to 25 miles. Its Meramec and Huzzah trips
--                        are different water entirely, and its horseback
--                        riding and cabins are not a river fact at all.
--   Ozark Outdoors       runs a 10-mile Butts Slab float and a SEASONAL 5-mile
--                        "Courtois Primitive". Seasonal on the Courtois and not
--                        on the Meramec — which one seasonal_notes on the
--                        business cannot say.
--   BSC Outdoors         runs the same 3-, 5- and 8-mile trips on both the
--                        Gasconade and the Big Piney, which is the case where
--                        the facts really are identical and nothing is lost.
--
-- ── EMPTY MEANS "NO CLAIM", NOT "NOTHING" ──────────────────────────────────
--
-- services_offered defaults to an empty array and every existing link keeps it.
-- Readers fall back to the business's own list when it is empty, so this change
-- is invisible until somebody records a river-specific fact. Reading empty as
-- "offers nothing here" would silently strip every one of the 207 existing
-- links, which is why the column comment says so and the API says so again at
-- the point of use.

alter table public.service_rivers
  add column if not exists services_offered public.service_offering[] not null default '{}',
  add column if not exists routes jsonb not null default '[]'::jsonb,
  add column if not exists seasonal_notes text,
  add column if not exists verified_source text,
  add column if not exists checked_at date;

alter table public.service_rivers
  drop constraint if exists service_rivers_routes_is_array;
alter table public.service_rivers
  add constraint service_rivers_routes_is_array
  check (jsonb_typeof(routes) = 'array');

comment on column public.service_rivers.services_offered is
  'What this business offers ON THIS RIVER, when that differs from what it offers generally. Empty means "no river-specific claim" and readers fall back to nearby_services.services_offered — it does NOT mean the business offers nothing here.';

comment on column public.service_rivers.routes is
  'Float routes this business runs on this river, as a jsonb array of {name, miles, putIn, takeOut, seasonal}. Bass'' River Resort sells 6-, 7- and 13-mile Courtois runs between Berryman, Blunts, Bass'' and Scotia; its Meramec trips are different water entirely. A single services_offered array on the business cannot say that.';

comment on column public.service_rivers.seasonal_notes is
  'Seasonality specific to this river. Ozark Outdoors runs a "Courtois Primitive" trip seasonally while its Meramec operation is not seasonal.';

comment on column public.service_rivers.verified_source is
  'Where the river-specific facts on this link came from, and checked_at is when. Separate from nearby_services.verified_source because a business page and a river page are different pages.';

create index if not exists service_rivers_checked_idx
  on public.service_rivers (checked_at);
