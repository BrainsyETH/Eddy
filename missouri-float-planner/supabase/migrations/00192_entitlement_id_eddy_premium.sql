-- 00192_entitlement_id_eddy_premium.sql
-- The subscription shipped as "Eddy Premium", and the RevenueCat entitlement
-- was created with the identifier `eddy_premium`. 00180 defaulted this column
-- to `eddy_plus`, which was the placeholder the runbook proposed.
--
-- This default only applies to rows inserted WITHOUT naming an entitlement id.
-- RevenueCat normally sends `entitlement_ids`, and the application passes
-- DEFAULT_ENTITLEMENT_ID explicitly on every read. It is corrected anyway,
-- because a column default that disagrees with the application constant is a
-- trap for whoever writes the next query rather than a live bug.

alter table public.entitlements
    alter column entitlement_id set default 'eddy_premium';

-- Re-key anything already written under the placeholder. Expected to affect
-- zero rows — no purchase has been made yet — but written to be safe if one
-- has: an entitlement row that no query matches is a paying customer with no
-- access, and nothing about that failure is visible from the outside.
update public.entitlements
set entitlement_id = 'eddy_premium'
where entitlement_id = 'eddy_plus';
