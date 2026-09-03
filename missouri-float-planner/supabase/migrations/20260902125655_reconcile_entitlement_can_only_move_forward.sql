-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-02 12:56:55 UTC and
-- RECORDED as 20260902125655; authored as 20260826112559 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt. It had sat
-- merged and unapplied for a week, during which every /api/me/entitlement/
-- refresh returned an error the client swallowed and a TRANSFER with no
-- source row 5xxed until RevenueCat gave up.
--
-- ── Why the reconcile is one statement in the database ────────────────────
--
-- src/lib/revenuecat/api.ts pulls a subscriber's real entitlement state from
-- RevenueCat's REST API and writes it down. It is a SECOND writer of
-- public.entitlements — the webhook is the first — and the rule that makes a
-- second writer safe is that this one can only ever GRANT or EXTEND, never
-- revoke or shorten. Revocation stays with the webhook, where EXPIRATION,
-- CANCELLATION and refunds arrive.
--
-- Expressed in TypeScript that rule was a lie under concurrency: read the
-- stored expiry, compare, then upsert. A RENEWAL webhook landing between the
-- read and the write is silently overwritten by the older expiry the reconcile
-- was holding — the exact revocation the rule forbids, on a live subscriber,
-- with the losing write reported as success. The window is small and the
-- trigger is ordinary: a restore on the same day a subscription renews.
--
-- A comparison and a write that must not be separated belong in one statement.
-- INSERT ... ON CONFLICT DO UPDATE takes the row lock before evaluating its
-- WHERE, so the stored expiry this reads is the one it writes over, and a
-- concurrent renewal either lands first (and wins, because it is later) or
-- waits (and wins, for the same reason).
--
-- The return value distinguishes the three outcomes the caller reports:
--   granted      — the row was created or moved forward
--   current      — already at or beyond this expiry; nothing written
--   unknown_user — a well-formed uuid with no auth user behind it, which is a
--                  deleted account and is not retryable

create or replace function public.reconcile_entitlement(
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
    p_last_event_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
    v_wrote boolean := false;
begin
    -- Access is stated purely as expires_at, so there is nothing to write
    -- without one. The caller already refuses this case; belt and braces.
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
        -- The appUserID IS the Supabase user id (see the webhook route).
        p_user_id::text,
        p_last_event_id,
        p_last_event_type,
        p_last_event_at
    )
    on conflict (user_id, entitlement_id) do update
       set expires_at = excluded.expires_at,
           will_renew = excluded.will_renew,
           -- RevenueCat is authoritative on the billing issue: it reports null
           -- when there is none, and a reconcile that could not clear a
           -- resolved one would leave the card warning about a fixed card.
           billing_issue_detected_at = excluded.billing_issue_detected_at,
           -- These three are only overwritten when the pull actually carried
           -- them. A subscription with no store entry to read leaves whatever
           -- the webhook already recorded rather than blanking it.
           product_id = coalesce(excluded.product_id, e.product_id),
           store = coalesce(excluded.store, e.store),
           environment = coalesce(excluded.environment, e.environment),
           rc_app_user_id = coalesce(excluded.rc_app_user_id, e.rc_app_user_id),
           last_event_id = coalesce(excluded.last_event_id, e.last_event_id),
           last_event_type = coalesce(excluded.last_event_type, e.last_event_type),
           last_event_at = coalesce(excluded.last_event_at, e.last_event_at)
     -- THE GUARANTEE. Forward only: a stored expiry at or beyond this one wins
     -- and no row is written, which RETURNING then reports as 'current'.
     where e.expires_at is null or e.expires_at < excluded.expires_at
    returning true into v_wrote;

    if v_wrote then
        return 'granted';
    end if;
    return 'current';
exception
    -- The uuid parses but no auth user is behind it: a deleted account.
    -- Retrying never succeeds, so say so rather than raising.
    when foreign_key_violation then
        return 'unknown_user';
end;
$$;

-- PostgREST exposes every function in the public schema as an RPC endpoint, so
-- the grants are the access control. Only the service role calls this — the
-- app reaches it through /api/me/entitlement/refresh, which authenticates the
-- caller and passes their own id. SECURITY DEFINER above is what lets it write
-- a table with no write policy for anyone (migration 00180).
revoke all on function public.reconcile_entitlement(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.reconcile_entitlement(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, text, text, timestamptz
) to service_role;

comment on function public.reconcile_entitlement(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, text, text, timestamptz
) is
    'Forward-only entitlement write for the RevenueCat REST reconcile. Grants or '
    'extends; never revokes or shortens. Returns granted | current | unknown_user | none.';
