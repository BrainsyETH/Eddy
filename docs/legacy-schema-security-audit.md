# Legacy schema-security audit

## Why this exists

Eddy's local migration filenames and production migration-history rows diverged
before `00212`. The forward migration gate intentionally freezes that history;
it prevents new drift but cannot prove that an older RLS policy, grant, or CHECK
constraint reached production.

Do not attempt to make the histories look equal by renaming or replaying legacy
migrations. Audit the database objects that exist now.

## One-time audit before the feedback policy release

Run these catalog checks against production with a read-only operator session
and save the output with the release evidence. Never paste credentials into the
repository.

```sql
-- RLS state for every application table.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- Effective policy definitions, including roles and WITH CHECK expressions.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Public-table CHECK constraints as PostgreSQL actually enforces them.
select c.relname as table_name, con.conname,
       pg_get_constraintdef(con.oid, true) as definition,
       con.convalidated
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and con.contype = 'c'
order by c.relname, con.conname;

-- Direct table privileges granted to API-facing roles.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Review the results against the final state expressed by the legacy migrations,
with priority on migrations containing `POLICY`, `ROW LEVEL SECURITY`, `GRANT`,
`REVOKE`, or `CHECK`. Record every mismatch as either:

1. a forward-only corrective migration, or
2. an explicitly accepted production exception with an owner and expiry.

At minimum, confirm these release invariants:

- `feedback` has RLS enabled; after the API-only migration it has no INSERT
  policy for `anon` or `authenticated`, and its feedback-type CHECK includes
  `gauge_recalibration`.
- `segment_cache` has no public mutation policy or mutation grant.
- Admin-only policies call the canonical `is_admin()` function.
- Alert subscription kind and one-shot constraints match the current API types.

Turn each confirmed critical invariant into a catalog-level automated check when
the linked database test harness is available. Until then, this audit is release
evidence, not a substitute for the forward migration gate.
