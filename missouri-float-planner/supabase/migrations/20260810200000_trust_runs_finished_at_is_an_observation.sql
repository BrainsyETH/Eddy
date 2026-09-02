-- APPLIED to production as version 20260810200000 (the filename matches the recording;
-- ledger: supabase/production-migrations.txt). Originally: apply by hand, then confirm with
-- `npm run db:check-migrations` and rename this file if Supabase records a
-- different one — the repo's rule is that the filename matches the version
-- actually recorded, not the version we hoped for.
--
-- Makes trust_runs.finished_at an observation instead of an intention, repairs
-- the rows written while it was neither, and adds the constraint that would
-- have made this impossible to ship.
--
-- ── What is wrong ───────────────────────────────────────────────────────
--
-- trust_apply_reconcile() closes a run with `finished_at = v_now`, where v_now
-- is the instant the caller passed in. That instant is captured ONCE per tick,
-- in runTrustCheck()'s caller, and handed to every check in the drain. So:
--
--   * finished_at is identical across every check in a tick, and
--   * finished_at is EARLIER than started_at on every row, because started_at
--     defaults to now() at insert — which happens after the tick's `now` was
--     taken, and again for each successive check.
--
-- On production on 2026-08-10 this held for all 469 rows written since the
-- first tick. A representative tick:
--
--   check_id              started_at        finished_at       duration_ms
--   validate_river_data   19:00:20.219      19:00:16.089      1064
--   ledger_heartbeat      19:00:18.671      19:00:16.089      1433
--   known_regressions     19:00:17.939      19:00:16.089       645
--
-- Three checks, three different start times, one shared finish time, all three
-- finishing four, three and two seconds before they began.
--
-- ── Why the shared `now` is right everywhere else ───────────────────────
--
-- This is not an argument for threading a second clock through the payload.
-- last_seen_at and resolved_at SHOULD share one instant across a run: they are
-- how the ledger says "as of this pass", and reconciliation compares them to
-- snooze deadlines taken from the same pass. A run that stamped each finding
-- with its own wall-clock would make "seen in the same run" unanswerable
-- without joining back through last_run_id.
--
-- finished_at is the one column in the payload that is not a statement about
-- the pass. It is a claim about when this function got here, and only this
-- function knows that. So it comes from the database clock — the same clock
-- started_at's default uses, which is what makes the interval between them mean
-- anything at all.
--
-- ── clock_timestamp(), NOT now() ─────────────────────────────────────────
--
-- The first version of this migration used now(), on the reasoning that the
-- function is one statement so the transaction's start is the finalize instant
-- "to within the time it takes to run". That reasoning is wrong, and it is
-- wrong in the direction that hides itself.
--
-- now() is the start of the enclosing TRANSACTION and is fixed for its whole
-- duration. Everything this function does — the raise loop, the touch loop, the
-- resolve, the anomaly branch — happens BEFORE the update below. So now() here
-- is the instant the reconcile RPC BEGAN, and finished_at would systematically
-- under-report by exactly the reconciliation work it is supposed to bracket.
--
-- What makes that worse than a plain inaccuracy is that the constraint added at
-- the bottom of this file would still pass: transaction start is comfortably
-- after the run row's insert in an earlier transaction, so the ordering holds
-- and the column looks repaired while still meaning the wrong thing. A check
-- that passes for the wrong reason is the failure this subsystem exists to
-- catch, and it nearly shipped inside the migration written to fix an instance
-- of it.
--
-- clock_timestamp() reads the actual wall clock at the moment of evaluation,
-- which is what "when did this finish" requires. The DO block at the end of
-- this file asserts the difference: it fails under now() and passes under
-- clock_timestamp().
--
-- ── Why a backfill is possible, and what it is worth ────────────────────
--
-- duration_ms was measured independently, in the application, from before the
-- run row was inserted to after reconciliation was planned. It is correct. So
-- the finish time of an already-written row is recoverable as
-- started_at + duration_ms, and the repair below does that.
--
-- It is a reconstruction, not a recording, and it is wrong by a bounded and
-- known amount: duration_ms starts counting slightly BEFORE started_at (the
-- insert round-trip sits between them), so the reconstructed finish runs late
-- by roughly one insert. That is a few milliseconds against durations of one to
-- four seconds. Stated here rather than smoothed over, because a repaired
-- timestamp that does not say it was repaired is the same species of small lie
-- as the one being repaired.
--
-- The alternative was to leave 469 rows holding a value that is not merely
-- imprecise but backwards, in the subsystem whose entire purpose is a record
-- that can be believed. A reconstruction with a stated error beats that.
--
-- ── Why the constraint comes last ───────────────────────────────────────
--
-- trust_runs_finished_after_started is the part that stops this recurring. It
-- cannot be added before the backfill: every existing row violates it, so the
-- validation scan would fail and the migration would abort. Added after, it
-- validates against the repaired rows and Postgres reports convalidated.
--
-- It permits NULL, which is load-bearing. A run row is opened pessimistically
-- with status 'error' and no finish time, and stays that way if the function is
-- killed partway. "Did not finish" must remain expressible.
--
-- It is `>=` and not `>` for a reason found while verifying it. now() is the
-- enclosing TRANSACTION's start, so if a caller ever opens the run row and
-- finalizes it inside one transaction, both timestamps are the same value and a
-- strict `>` would reject a run that did nothing wrong. The production path uses
-- two round-trips and shows a real interval — verified on scratch Postgres 16:
-- a finalize one second after the insert recorded 00:00:01.046303. Equality is
-- the degenerate case of a correct ordering, not a violation of it.
--
-- ── Replay-safe ─────────────────────────────────────────────────────────
--
-- On a fresh database the backfill matches zero rows and the constraint
-- validates against an empty table. The function body below is byte-identical
-- to 20260804193348 except for the single `finished_at` assignment and the
-- comment above it; verify with md5(prosrc) after applying, as that migration
-- did.

create or replace function public.trust_apply_reconcile(p_payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_catalog, pg_temp
as $$
declare
    v_run_id      uuid        := (p_payload ->> 'run_id')::uuid;
    v_check_id    text        := p_payload ->> 'check_id';
    v_now         timestamptz := (p_payload ->> 'now')::timestamptz;
    v_raised      integer     := 0;
    v_touched     integer     := 0;
    v_resolved    integer     := 0;
    v_rows        integer;
    v_item        jsonb;
    v_resolve_fps text[];
begin
    if v_run_id is null or v_check_id is null or v_now is null then
        raise exception 'trust_apply_reconcile: run_id, check_id and now are required';
    end if;

    -- ── raise ────────────────────────────────────────────────────────────
    -- first_seen_at is absent from the DO UPDATE list on purpose. A finding
    -- that was resolved and has come back keeps the date it first appeared,
    -- which is the only way the console can tell "broken since March" from
    -- "broke again last night".
    --
    -- occurrences counts EPISODES, not sightings: incremented here, where a
    -- finding is raised or re-raised, and never on a touch. An hourly check
    -- would otherwise reach 24 a day and the number would mean nothing.
    for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'raise', '[]'::jsonb))
    loop
        insert into public.trust_findings (
            fingerprint, check_id, rule_key, entity_type, entity_key, severity,
            status, title, detail, evidence, last_seen_at, resolved_at,
            snoozed_until, last_run_id
        )
        values (
            v_item ->> 'fingerprint',
            v_check_id,
            v_item ->> 'rule_key',
            v_item ->> 'entity_type',
            v_item ->> 'entity_key',
            v_item ->> 'severity',
            case when v_item ->> 'snoozed_until' is null then 'open' else 'snoozed' end,
            v_item ->> 'title',
            v_item ->> 'detail',
            coalesce(v_item -> 'evidence', '{}'::jsonb),
            v_now,
            null,
            (v_item ->> 'snoozed_until')::timestamptz,
            v_run_id
        )
        on conflict (fingerprint) do update set
            check_id      = excluded.check_id,
            rule_key      = excluded.rule_key,
            entity_type   = excluded.entity_type,
            entity_key    = excluded.entity_key,
            severity      = excluded.severity,
            status        = excluded.status,
            title         = excluded.title,
            detail        = excluded.detail,
            evidence      = excluded.evidence,
            last_seen_at  = excluded.last_seen_at,
            resolved_at   = excluded.resolved_at,
            snoozed_until = excluded.snoozed_until,
            last_run_id   = excluded.last_run_id,
            occurrences   = public.trust_findings.occurrences + 1;

        get diagnostics v_rows = row_count;
        v_raised := v_raised + v_rows;
    end loop;

    -- ── touch ────────────────────────────────────────────────────────────
    -- Refresh the values without disturbing identity, status or occurrences.
    -- `wake` is set by the caller when a snooze deadline has passed:
    -- classifyExisting() already treats such a row as open, and this makes the
    -- row itself agree rather than leaving a stale deadline behind it.
    for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'touch', '[]'::jsonb))
    loop
        update public.trust_findings f
           set severity      = v_item ->> 'severity',
               title         = v_item ->> 'title',
               detail        = v_item ->> 'detail',
               evidence      = coalesce(v_item -> 'evidence', '{}'::jsonb),
               last_seen_at  = v_now,
               last_run_id   = v_run_id,
               status        = case when (v_item ->> 'wake')::boolean then 'open' else f.status end,
               snoozed_until = case when (v_item ->> 'wake')::boolean then null else f.snoozed_until end
         where f.fingerprint = v_item ->> 'fingerprint';

        get diagnostics v_rows = row_count;
        v_touched := v_touched + v_rows;
    end loop;

    -- ── resolve ──────────────────────────────────────────────────────────
    select array(select jsonb_array_elements_text(coalesce(p_payload -> 'resolve', '[]'::jsonb)))
      into v_resolve_fps;

    if array_length(v_resolve_fps, 1) > 0 then
        update public.trust_findings
           set status        = 'resolved',
               resolved_at   = v_now,
               snoozed_until = null,
               last_run_id   = v_run_id
         where check_id = v_check_id
           and fingerprint = any (v_resolve_fps)
           -- classifyExisting()'s rule, restated so this is a compare-and-set.
           and (status = 'open' or (status = 'snoozed' and snoozed_until <= v_now));

        get diagnostics v_resolved = row_count;
    end if;

    -- ── the check's complaint about itself ───────────────────────────────
    if p_payload -> 'anomaly' is not null and jsonb_typeof(p_payload -> 'anomaly') = 'object' then
        v_item := p_payload -> 'anomaly';
        insert into public.trust_findings (
            fingerprint, check_id, rule_key, entity_type, entity_key, severity,
            status, title, detail, evidence, last_seen_at, resolved_at,
            snoozed_until, last_run_id
        )
        values (
            v_item ->> 'fingerprint', v_check_id, v_item ->> 'rule_key',
            v_item ->> 'entity_type', v_item ->> 'entity_key', v_item ->> 'severity',
            'open', v_item ->> 'title', v_item ->> 'detail',
            coalesce(v_item -> 'evidence', '{}'::jsonb), v_now, null, null, v_run_id
        )
        on conflict (fingerprint) do update set
            severity      = excluded.severity,
            status        = 'open',
            title         = excluded.title,
            detail        = excluded.detail,
            evidence      = excluded.evidence,
            last_seen_at  = excluded.last_seen_at,
            resolved_at   = null,
            snoozed_until = null,
            last_run_id   = excluded.last_run_id;
    end if;

    -- The check reconciled cleanly, so any standing complaint about it is over.
    if coalesce((p_payload ->> 'clear_anomaly')::boolean, false) then
        update public.trust_findings
           set status        = 'resolved',
               resolved_at   = v_now,
               snoozed_until = null,
               last_run_id   = v_run_id
         where check_id = v_check_id
           and rule_key = 'reconcile_anomaly'
           and status <> 'resolved';
    end if;

    -- ── close the run ────────────────────────────────────────────────────
    -- Last, and in the same transaction as everything above. That is the whole
    -- point: either the ledger holds this run's changes AND a run row that
    -- describes them, or it holds neither and the row keeps the pessimistic
    -- 'run did not complete' it was opened with.
    --
    -- finished_at is clock_timestamp(), NOT v_now and NOT now(). Every other
    -- timestamp written by this function is a statement about the pass and
    -- shares the caller's instant deliberately. This one is a statement about
    -- when the pass ENDED, which the caller cannot know at the moment it
    -- captures `now` — and did not: the tick's instant is taken once, before
    -- any check runs, so v_now here landed before the run row's own started_at
    -- default and identically on every check in the drain.
    --
    -- now() would be the enclosing transaction's start, which is before every
    -- loop above and therefore before the work this timestamp is meant to
    -- bracket. clock_timestamp() is the wall clock as of this statement. Both
    -- satisfy the ordering constraint, which is exactly why the wrong one is
    -- worth naming here.
    update public.trust_runs
       set status            = p_payload #>> '{run,status}',
           finished_at       = clock_timestamp(),
           suppressed_reason = p_payload #>> '{run,suppressed_reason}',
           scope_count       = coalesce((p_payload #>> '{run,scope_count}')::integer, 0),
           findings_raised   = v_raised,
           findings_touched  = v_touched,
           findings_resolved = v_resolved,
           duration_ms       = (p_payload #>> '{run,duration_ms}')::integer,
           error_detail      = p_payload #>> '{run,error_detail}'
     where id = v_run_id;

    if not found then
        raise exception 'trust_apply_reconcile: no trust_runs row %', v_run_id;
    end if;

    return jsonb_build_object('raised', v_raised, 'touched', v_touched, 'resolved', v_resolved);
end;
$$;

revoke all on function public.trust_apply_reconcile(jsonb) from public;
revoke all on function public.trust_apply_reconcile(jsonb) from anon, authenticated;

-- ── repair the rows written before the above ─────────────────────────────
-- Reconstructed from the independently-measured duration_ms. Only rows that are
-- actually backwards are touched, so this is idempotent and will match nothing
-- on a second run or on a fresh database.
update public.trust_runs
   set finished_at = started_at + make_interval(secs => duration_ms / 1000.0)
 where finished_at is not null
   and duration_ms is not null
   and finished_at < started_at;

-- A run that never finished has no duration to reconstruct from, and inventing
-- one would turn "this run died" into "this run took no time". Left explicitly
-- unfinished instead — which is what the row already means.
update public.trust_runs
   set finished_at = null
 where finished_at is not null
   and duration_ms is null
   and finished_at < started_at;

-- ── and stop it happening again ──────────────────────────────────────────
alter table public.trust_runs
  add constraint trust_runs_finished_after_started
  check (finished_at is null or finished_at >= started_at);

-- ── the assertion the constraint cannot make ─────────────────────────────
--
-- The constraint above catches finished_at BEFORE started_at. It cannot catch
-- finished_at being the wrong instant in the right order, which is precisely
-- what now() would produce: the transaction's start, taken before the raise,
-- touch and resolve loops, and comfortably after the run row's insert in an
-- earlier transaction. Ordering holds; the meaning is wrong.
--
-- So this runs the function for real, with a measurable delay between opening
-- the run row and finalizing it, and asserts finished_at lands AFTER the
-- transaction began. Under now() the two are equal by definition and this
-- raises. Under clock_timestamp() it passes.
--
-- The caller's `now` is deliberately set to 2026-01-01 — a date far from any
-- real clock — so a regression that reinstates v_now fails here too rather
-- than passing because the tick happened to be recent.
do $$
declare
    v_run_id     uuid := gen_random_uuid();
    v_txn_start  timestamptz := now();
    v_started    timestamptz;
    v_finished   timestamptz;
begin
    insert into public.trust_runs (id, check_id, status, error_detail)
    values (v_run_id, '__finished_at_self_test__', 'error', 'run did not complete');

    perform pg_sleep(0.25);

    perform public.trust_apply_reconcile(jsonb_build_object(
        'run_id',   v_run_id,
        'check_id', '__finished_at_self_test__',
        'now',      '2026-01-01T00:00:00Z',
        'run',      jsonb_build_object('status', 'ok', 'scope_count', 1, 'duration_ms', 250)
    ));

    select started_at, finished_at into v_started, v_finished
      from public.trust_runs where id = v_run_id;

    if v_finished is null then
        raise exception 'finished_at self-test: a completed run recorded no finish time';
    end if;

    if v_finished < v_started then
        raise exception 'finished_at self-test: % precedes started_at %', v_finished, v_started;
    end if;

    if v_finished <= v_txn_start then
        raise exception
            'finished_at self-test: % is not after this transaction''s start % — '
            'trust_apply_reconcile is using now() (or the caller''s instant) rather '
            'than clock_timestamp(), so it records when reconciliation BEGAN',
            v_finished, v_txn_start;
    end if;

    delete from public.trust_runs where id = v_run_id;
end $$;
