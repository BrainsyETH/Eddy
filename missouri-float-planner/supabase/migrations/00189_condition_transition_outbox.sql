-- 00189_condition_transition_outbox.sql
-- Make condition transitions atomic and durable.
--
-- THE PROBLEM (update-gauges today): `last_condition_code` is flipped with a
-- bare UPDATE whose return value is discarded, and alerts publish AFTER the
-- loop — behind a 30s enrichment budget and up to 3 awaited LLM regens, inside
-- a 60s maxDuration. If the run is killed in between, the code has already
-- advanced, so the next pass sees old == new and the transition is lost
-- FOREVER. Vercel crons never retry. There is also no compare-and-swap, so the
-- hourly and 15-minute crons (which both fire at :00) can each detect and
-- publish the same transition.
--
-- THE FIX: one function, therefore one transaction, that
--   1. takes a row lock,
--   2. compare-and-swaps last_condition_code,
--   3. applies debounce,
--   4. writes the outbox event,
-- so the event is durable before anything is published.

-- ── Debounce state ───────────────────────────────────────────────
-- Lives on river_gauges because that is exactly the grain of
-- last_condition_code, which lets the SAME transaction that does the CAS also
-- read-modify-write the pending state. A separate table would reintroduce the
-- race it exists to close.
alter table public.river_gauges
    add column if not exists pending_condition_code text,
    add column if not exists pending_count integer not null default 0,
    add column if not exists pending_first_at timestamptz,
    add column if not exists pending_reading_at timestamptz;

-- pending_reading_at is load-bearing, not bookkeeping: without it the hourly
-- and 15-minute crons at :00 would each "confirm" the SAME reading and defeat
-- the debounce entirely. A confirmation only counts for a new reading.
comment on column public.river_gauges.pending_reading_at is
    'reading_timestamp of the last observation that advanced pending_count. A repeated reading must never confirm a debounce (the hourly and 15-min crons both fire at :00).';

-- ── The outbox RPC ───────────────────────────────────────────────
create or replace function public.record_condition_transition(
    p_river_gauge_id uuid,
    p_expected_condition_code text,
    p_new_condition_code text,
    p_kind text,
    p_reading_value numeric default null,
    p_reading_unit text default null,
    p_reading_at timestamptz default null,
    p_required_confirmations integer default 1,
    p_metadata jsonb default '{}'::jsonb
)
returns table (outcome text, event_id uuid, pending_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_river_id uuid;
    v_current text;
    v_pending_code text;
    v_pending_count integer;
    v_pending_first_at timestamptz;
    v_pending_reading_at timestamptz;
    v_event_id uuid;
begin
    -- FOR UPDATE is what serializes two overlapping cron passes.
    select rg.river_id, rg.last_condition_code, rg.pending_condition_code,
           rg.pending_count, rg.pending_first_at, rg.pending_reading_at
      into v_river_id, v_current, v_pending_code,
           v_pending_count, v_pending_first_at, v_pending_reading_at
      from public.river_gauges rg
     where rg.id = p_river_gauge_id
     for update;

    if not found then
        return query select 'not_found'::text, null::uuid, 0;
        return;
    end if;

    -- Compare-and-swap. A mismatch means another pass already advanced this
    -- gauge; emit nothing rather than double-firing.
    if v_current is distinct from p_expected_condition_code then
        return query select 'stale_cas'::text, null::uuid, 0;
        return;
    end if;

    if p_new_condition_code = v_current then
        update public.river_gauges
           set pending_condition_code = null, pending_count = 0,
               pending_first_at = null, pending_reading_at = null
         where id = p_river_gauge_id;
        return query select 'no_change'::text, null::uuid, 0;
        return;
    end if;

    -- ── Debounce ────────────────────────────────────────────────
    if p_required_confirmations > 1 then
        -- A stale pending (>6h) restarts rather than confirming, so yesterday's
        -- half-confirmation can't instantly fire today.
        if v_pending_code is distinct from p_new_condition_code
           or v_pending_first_at is null
           or v_pending_first_at < now() - interval '6 hours' then
            update public.river_gauges
               set pending_condition_code = p_new_condition_code,
                   pending_count = 1,
                   pending_first_at = now(),
                   pending_reading_at = p_reading_at
             where id = p_river_gauge_id;
            return query select 'pending'::text, null::uuid, 1;
            return;
        end if;

        -- Same reading seen twice (the :00 cron collision) must not confirm.
        if p_reading_at is not null and v_pending_reading_at is not distinct from p_reading_at then
            return query select 'pending'::text, null::uuid, v_pending_count;
            return;
        end if;

        v_pending_count := coalesce(v_pending_count, 0) + 1;

        if v_pending_count < p_required_confirmations then
            update public.river_gauges
               set pending_count = v_pending_count,
                   pending_reading_at = p_reading_at
             where id = p_river_gauge_id;
            return query select 'pending'::text, null::uuid, v_pending_count;
            return;
        end if;
    end if;

    -- ── Emit ────────────────────────────────────────────────────
    -- river_id is derived here, never trusted from the caller. It is nullable
    -- on river_gauges but NOT NULL on the events FK, so an unwired gauge still
    -- advances its code without an event.
    if v_river_id is null then
        update public.river_gauges
           set last_condition_code = p_new_condition_code,
               pending_condition_code = null, pending_count = 0,
               pending_first_at = null, pending_reading_at = null
         where id = p_river_gauge_id;
        return query select 'no_river'::text, null::uuid, 0;
        return;
    end if;

    insert into public.river_condition_events (
        river_id, river_gauge_id, old_condition_code, new_condition_code, kind,
        reading_value, reading_unit, reading_at, metadata
    ) values (
        v_river_id, p_river_gauge_id, coalesce(v_current, 'unknown'), p_new_condition_code,
        p_kind, p_reading_value, p_reading_unit, p_reading_at, coalesce(p_metadata, '{}'::jsonb)
    )
    on conflict do nothing
    returning id into v_event_id;

    update public.river_gauges
       set last_condition_code = p_new_condition_code,
           pending_condition_code = null, pending_count = 0,
           pending_first_at = null, pending_reading_at = null
     where id = p_river_gauge_id;

    -- A null event_id means the unique dedupe index caught a replay; the code
    -- still advanced, so report it distinctly rather than as a fresh emit.
    if v_event_id is null then
        return query select 'duplicate'::text, null::uuid, 0;
    else
        return query select 'emitted'::text, v_event_id, 0;
    end if;
end;
$$;

-- Service-role only: this mutates condition state and the alert outbox.
revoke execute on function public.record_condition_transition(
    uuid, text, text, text, numeric, text, timestamptz, integer, jsonb
) from public, anon, authenticated;
