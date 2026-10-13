-- Reports are submitted and moderated by server routes using the service role.
-- Direct client writes bypass validation, throttling and image quarantine.
-- Remove both privileges and policies: a later table grant must not reopen it.
REVOKE INSERT, UPDATE ON TABLE public.community_reports FROM PUBLIC, anon, authenticated;

-- Table revokes do not remove independently granted column privileges.
DO $$
DECLARE
  columns_sql text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO columns_sql
    FROM pg_attribute
   WHERE attrelid = 'public.community_reports'::regclass
     AND attnum > 0 AND NOT attisdropped;
  EXECUTE format(
    'REVOKE INSERT (%1$s), UPDATE (%1$s) ON public.community_reports FROM PUBLIC, anon, authenticated',
    columns_sql
  );
END;
$$;

DROP POLICY IF EXISTS community_reports_insert ON public.community_reports;
DROP POLICY IF EXISTS community_reports_update ON public.community_reports;

-- Preserve the existing SELECT and admin DELETE policies and server writes.
GRANT INSERT, UPDATE ON TABLE public.community_reports TO service_role;
