-- A trust finding can name a dam.
--
-- ── Why the union alone was not enough ──────────────────────────────────────
--
-- src/lib/trust/types.ts carries the TrustEntityType union and says, in its own
-- header, that widening it does not widen the database: trust_apply_reconcile()
-- inserts entity_type unvalidated and this CHECK is the only gate. So a check
-- emitting 'dam' against the old constraint does not file a mis-typed finding —
-- it throws, the run fails, and the ledger reports a broken check instead of a
-- frozen dam.
--
-- This migration must therefore land BEFORE the deploy that registers
-- dam_freshness. In the other order the first tick after deploy errors.
--
-- ── Why 'dam' and not one of the six that already existed ───────────────────
--
-- 'gauge' was the near miss. Dams do back gauge_stations rows in principle —
-- UsaceDam.id doubles as gauge_stations.site_id_external — but only ONE of the
-- twenty-four actually has such a row in production (swl-clearwater-dam,
-- 'Black River below Clearwater Dam'). Filing the other twenty-three under a
-- gauge key would mean minting identities for rows that do not exist, and the
-- fingerprint hashes the entity key, so those identities would be load-bearing.
--
-- 'river' is worse: twenty-three of the twenty-four dams have no Eddy river
-- below them at all, which is the entire finding of the 2026-08 source review.
--
-- 'global' would have worked without this migration, and was rejected on
-- meaning rather than mechanism. The type is what the console groups and
-- filters by; a dam filed as 'global' is a dam that cannot be listed as a dam.
--
-- No backfill: nothing has ever written 'dam', so this only widens what is
-- accepted from here on.

alter table public.trust_findings
    drop constraint if exists trust_findings_entity_type;

alter table public.trust_findings
    add constraint trust_findings_entity_type
    check (entity_type = any (array[
        'river'::text,
        'gauge'::text,
        'access_point'::text,
        'service'::text,
        'dam'::text,
        'repo'::text,
        'global'::text
    ]));

do $$
begin
    -- The union in types.ts is the other half of this pair and drifts silently.
    -- Assert the shape here so a rebuilt database proves the constraint took,
    -- rather than discovering it on the first dam finding.
    if not exists (
        select 1
          from pg_constraint
         where conrelid = 'public.trust_findings'::regclass
           and conname = 'trust_findings_entity_type'
           and pg_get_constraintdef(oid) like '%''dam''%'
    ) then
        raise exception 'trust_findings_entity_type does not admit dam; dam_freshness will fail on its first finding.';
    end if;

    raise notice 'trust_findings now accepts entity_type = dam.';
end $$;
