-- Let a trust finding be about a service.
--
-- ── Why not reuse an existing entity type ─────────────────────────────────
--
-- The next migration adds a check over `nearby_services`, and its findings are
-- per-business: this outfitter's pin is 17 miles from the river it is filed
-- against. Neither existing type can carry that.
--
-- `river` collides outright. The fingerprint is
-- sha256(check_id | entity_type | entity_key | rule_key), so keying on a river
-- slug would merge every service on the Current into ONE finding — the second
-- defect found would touch the first instead of opening its own, and fixing one
-- would resolve the record of all of them.
--
-- `global` keeps the fingerprint distinct, because the key would still be the
-- service uuid. But types.ts defines global as "a fact about the deployment" or
-- "a fact about the ledger", and the console renders `{entityType}: {entityKey}`
-- — so an operator would read `global: 3fa85f64-…`, which names nothing. That is
-- lying in the type to avoid four lines of SQL.
--
-- ── This must be applied BEFORE the check is registered ───────────────────
--
-- trust_apply_reconcile() inserts `v_item ->> 'entity_type'` with no validation
-- of its own, so this CHECK is the only gate. If the check runs first, the
-- insert violates the constraint, the whole reconcile transaction fails, the run
-- is recorded as errored, and the ledger files a critical reconcile_anomaly
-- against itself — for a check that was working correctly.

ALTER TABLE public.trust_findings
  DROP CONSTRAINT IF EXISTS trust_findings_entity_type;

ALTER TABLE public.trust_findings
  ADD CONSTRAINT trust_findings_entity_type
  CHECK (entity_type IN ('river', 'gauge', 'access_point', 'service', 'repo', 'global'));
