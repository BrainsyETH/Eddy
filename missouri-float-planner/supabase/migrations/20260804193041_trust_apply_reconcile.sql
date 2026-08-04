-- APPLIED to production 2026-08-04 as 20260804193041.
--
-- Two things about this file differ from the statement production recorded
-- under that version. Both were corrected within minutes and both are recorded
-- as their own migrations, because rewriting history to look tidy is how a
-- migration list stops being evidence:
--
--   20260804193216 — the grants below originally revoked only from PUBLIC,
--                    which left Supabase's default EXECUTE grants to anon and
--                    authenticated untouched.
--   20260804193348 — the body was transcribed without its inline commentary.
--
-- This file carries the corrected form of both, so a replay from scratch is
-- right the first time and those two become no-ops. It is the authoritative
-- definition; they are the audit trail of arriving at it.
--
-- Apply one check run's reconciliation as a single transaction.
--
-- ── What was wrong with doing it from the client ─────────────────────────
--
-- runTrustCheck() issued the finding changes and the run finalization as
-- separate PostgREST round-trips across three loops. A Vercel timeout or a
-- deploy landing mid-run could raise some findings, resolve others, and leave
-- the pessimistic run row still saying 'error' — a ledger state that
-- corresponds to no completed run, and no way afterwards to tell which half
-- happened.
--
-- The ledger's entire claim is that it is durable evidence of what was checked
-- and when. Evidence assembled out of six independent writes, any of which can
-- be the last one, is not that.
--
-- ── What stayed in TypeScript, and why ───────────────────────────────────
--
-- The DECISION. planReconcile(), severityForRule() and fingerprint() are pure,
-- exhaustively tested, and hold every rule that determines whether this system
-- can be believed — including the four refusals that stop a broken check
-- resolving findings it never looked at.
--
-- This function is deliberately dumb: it applies a plan somebody else decided.
-- It contains no policy, so there is nothing here to disagree with reconcile.ts
-- about, and the tests that matter keep running in CI without a database.
--
-- ── Where it is stricter than the client was ─────────────────────────────
--
-- 1. Raise is an upsert on the fingerprint rather than a read-then-branch. The
--    client chose INSERT or UPDATE from a read taken earlier in the request; a
--    row created in between made that choice wrong and the insert died on the
--    unique constraint. ON CONFLICT cannot be wrong about it.
--
-- 2. Everything keys on `fingerprint`, not on ids from that earlier read. The
--    fingerprint IS the identity; an id is a detail of a row that may since
--    have been replaced.
--
-- 3. Resolve re-states the openness test in the WHERE clause, so it is a
--    compare-and-set rather than a blind write. The test is classifyExisting()'s
--    rule exactly: status 'open', OR 'snoozed' with a deadline that has passed.
--    An operator who snoozed a finding one second ago keeps their snooze; an
--    expired snooze is still resolvable, which it must be or a one-day snooze
--    would shield a finding forever.

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
    update public.trust_runs
       set status            = p_payload #>> '{run,status}',
           finished_at       = v_now,
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

comment on function public.trust_apply_reconcile(jsonb) is
    'Applies one trust check run''s reconciliation plan and closes its run row in a single transaction. Carries no policy: planReconcile() in src/lib/trust/reconcile.ts decides, this applies.';

-- ── grants ───────────────────────────────────────────────────────────────
--
-- Revoking from PUBLIC is NOT enough, and this was caught on the live database
-- rather than reasoned out: after applying with only the PUBLIC revoke, the
-- function's ACL read
--
--     postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres
--
-- Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions in
-- `public` to anon and authenticated DIRECTLY. A direct grant is not a PUBLIC
-- grant, so `revoke ... from public` does not touch it — and every new function
-- in this schema is born reachable by the publishable key, which Metro inlines
-- into the shipped iOS bundle by design.
--
-- RLS would have held: this is SECURITY INVOKER, and trust_findings/trust_runs
-- are service_role-only, so an anon call fails on the policy rather than
-- writing anything. But "RLS is holding, the grant is redundant" is precisely
-- the finding trust_schema_invariants() raises about `feedback`
-- (schema_feedback_no_public_mutation_grants, high), and 20260804181529 exists
-- because leaving it that way was judged wrong there. Shipping a new mutating
-- function with the same shape would be repeating the mistake in the subsystem
-- built to notice it.
revoke all on function public.trust_apply_reconcile(jsonb) from public;
revoke all on function public.trust_apply_reconcile(jsonb) from anon, authenticated;
grant execute on function public.trust_apply_reconcile(jsonb) to service_role;
