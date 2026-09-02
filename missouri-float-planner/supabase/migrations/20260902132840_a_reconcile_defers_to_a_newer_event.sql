-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-02 13:28:40 UTC and
-- RECORDED as 20260902132840; authored as 20260902140000 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt. Applied ahead
-- of the deploy that passes p_observed_at from src/lib/revenuecat/api.ts: the
-- argument defaults to null, which leaves the deployed client on the
-- 20260902125655 behaviour until it ships. The single-overload invariant at
-- the foot passed.
--
-- ── The race 20260902125655 left open ──────────────────────────────────────
--
-- "Forward only" — a stored expiry at or beyond the incoming one wins — is the
-- right rule against a STALE reconcile: one holding an older snapshot than a
-- renewal the webhook already wrote. It is the wrong rule against a LEGITIMATE
-- backward move that lands between the REST read and the RPC write.
--
-- Sequence: the user taps Restore; /api/me/entitlement/refresh reads
-- RevenueCat's REST view at T0, which still shows the subscription live to
-- 2027; a refund is processed at T1 > T0 and its webhook writes expires_at =
-- T1 and last_event_at = T1; the RPC then runs with the 2027 expiry from T0,
-- finds the stored expiry earlier, and moves it forward. Access restored after
-- revocation, reported as `granted`. The window is one REST round trip, up to
-- the client's 8 s timeout, and the person timing it is the one who just
-- asked for a refund.
--
-- ── The fix needs no new column ────────────────────────────────────────────
--
-- The webhook already stamps last_event_at with the event's own time on every
-- write, refunds included (src/app/api/webhooks/revenuecat/route.ts), and
-- refuses events older than the one it holds. So the row knows when it last
-- learned something. The reconcile passes the moment its REST read STARTED as
-- p_observed_at, and the write is refused when the row has learned something
-- since: e.last_event_at > p_observed_at. A snapshot taken before the newest
-- event cannot be trusted to move the row forward, whatever it says.
--
-- The refusal reports 'current', the same as an already-current row. From the
-- caller's side both mean "nothing written; the row is authoritative", and
-- the Restore button goes on to poll /api/me/profile either way.
--
-- Event time, not delivery time, on both sides: the webhook stamps the
-- event's timestamp, and a refund that HAPPENED before the REST read is one
-- the REST read already reflects, so it is the forward-only clause that
-- answers it, correctly, with 'current'. Clock skew between RevenueCat's
-- stamps and this server's clock could only turn a `granted` into a
-- `current` in the seconds around an event, never the reverse.
--
-- ── Why DROP, not CREATE OR REPLACE ────────────────────────────────────────
--
-- Adding a parameter changes the signature, and CREATE OR REPLACE on a new
-- signature creates a second overload beside the old one rather than
-- replacing it. Two overloads that differ only by a defaulted trailing
-- argument make every PostgREST call ambiguous. The old signature is dropped
-- first; nothing calls it positionally.

drop function if exists public.reconcile_entitlement(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, text, text, timestamptz
);

create function public.reconcile_entitlement(
    p_user_id uuid,
    p_entitlement_id text,
    p_expires_at timestamptz,
    p_will_renew boolean,
    p_product_id text,
    p_store text,
    p_environment text,
    p_billing_issue_detected_at timestamptz,
    p_last_event_id text default null,
    p_last_event_type text default null,
    p_last_event_at timestamptz default null,
    p_observed_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
    v_wrote boolean := false;
begin
    if p_expires_at is null then
        return 'none';
    end if;

    insert into public.entitlements as e (
        user_id,
        entitlement_id,
        expires_at,
        will_renew,
        product_id,
        store,
        environment,
        billing_issue_detected_at,
        rc_app_user_id,
        last_event_id,
        last_event_type,
        last_event_at
    )
    values (
        p_user_id,
        p_entitlement_id,
        p_expires_at,
        p_will_renew,
        p_product_id,
        p_store,
        p_environment,
        p_billing_issue_detected_at,
        p_user_id::text,
        p_last_event_id,
        p_last_event_type,
        p_last_event_at
    )
    on conflict (user_id, entitlement_id) do update
       set expires_at = excluded.expires_at,
           will_renew = excluded.will_renew,
           billing_issue_detected_at = excluded.billing_issue_detected_at,
           product_id = coalesce(excluded.product_id, e.product_id),
           store = coalesce(excluded.store, e.store),
           environment = coalesce(excluded.environment, e.environment),
           rc_app_user_id = coalesce(excluded.rc_app_user_id, e.rc_app_user_id),
           last_event_id = coalesce(excluded.last_event_id, e.last_event_id),
           last_event_type = coalesce(excluded.last_event_type, e.last_event_type),
           last_event_at = coalesce(excluded.last_event_at, e.last_event_at)
     -- THE GUARANTEE, in two parts. Forward only: a stored expiry at or beyond
     -- this one wins. And not from the past: a row that learned something after
     -- this snapshot was taken wins too, whatever the snapshot says.
     where (e.expires_at is null or e.expires_at < excluded.expires_at)
       and (p_observed_at is null or e.last_event_at is null or e.last_event_at <= p_observed_at)
    returning true into v_wrote;

    if v_wrote then
        return 'granted';
    end if;
    return 'current';
exception
    when foreign_key_violation then
        return 'unknown_user';
end;
$$;

revoke all on function public.reconcile_entitlement(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, text, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.reconcile_entitlement(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, text, text, timestamptz, timestamptz
) to service_role;

comment on function public.reconcile_entitlement(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, text, text, timestamptz, timestamptz
) is
    'Forward-only entitlement write for the RevenueCat REST reconcile. Grants or '
    'extends; never revokes or shortens; and never moves a row forward from a '
    'snapshot older than the row''s last event (p_observed_at). '
    'Returns granted | current | unknown_user | none.';

-- ── Invariant: exactly one reconcile_entitlement, with twelve arguments ──────
DO $$
DECLARE
    n int;
    args int;
BEGIN
    SELECT count(*), max(pronargs) INTO n, args
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = 'reconcile_entitlement';
    IF n <> 1 THEN
        RAISE EXCEPTION 'expected one reconcile_entitlement overload, found %', n;
    END IF;
    IF args <> 12 THEN
        RAISE EXCEPTION 'expected reconcile_entitlement to take 12 arguments, found %', args;
    END IF;
END $$;
