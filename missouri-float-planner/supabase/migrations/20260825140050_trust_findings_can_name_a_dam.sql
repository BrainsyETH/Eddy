-- A trust finding can name a dam.
--
-- APPLIED to production 2026-08-25 as 20260825140050. The body below is what
-- was applied; the filename carries production's version so the histories pair
-- exactly (`npm run db:check-migrations`).
--
-- src/lib/trust/types.ts carries the TrustEntityType union and says, in its own
-- header, that widening it does not widen the database: trust_apply_reconcile()
-- inserts entity_type unvalidated and this CHECK is the only gate. So a check
-- emitting 'dam' against the old constraint does not file a mis-typed finding —
-- it throws, the run fails, and the ledger reports a broken check instead of a
-- frozen dam. This must land BEFORE the deploy that registers dam_freshness.
--
-- Why 'dam' and not one of the six that already existed: 'gauge' was the near
-- miss, since UsaceDam.id doubles as gauge_stations.site_id_external — but only
-- ONE of the twenty-four dams has such a row in production
-- (swl-clearwater-dam), and the fingerprint hashes the entity key, so filing
-- the other twenty-three under a gauge key would mint load-bearing identities
-- for rows that do not exist. 'river' is worse: most dams have no Eddy river
-- below them. 'global' would have worked without this migration and was
-- rejected on meaning — the type is what the console groups and filters by, and
-- a dam filed as 'global' is a dam that cannot be listed as a dam.
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
