-- Preserve revocation work in the SAME transaction as auth account deletion.
-- No FK: this credential must survive the deleted user until Apple accepts it.
BEGIN;

CREATE TABLE public.apple_token_revocations (
  id uuid PRIMARY KEY,
  refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  last_error text
);
CREATE INDEX apple_token_revocations_due ON public.apple_token_revocations (next_attempt_at);
ALTER TABLE public.apple_token_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_token_revocations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apple_token_revocations TO service_role;
CREATE POLICY apple_token_revocations_service ON public.apple_token_revocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Auth deletes run as supabase_auth_admin. A narrowly scoped trigger is needed
-- to copy the private token without granting that role access to the outbox.
CREATE SCHEMA IF NOT EXISTS eddy_private;
REVOKE ALL ON SCHEMA eddy_private FROM PUBLIC, anon, authenticated;
CREATE FUNCTION eddy_private.queue_apple_revocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.apple_token_revocations (id, refresh_token)
  SELECT OLD.id, refresh_token FROM public.apple_refresh_tokens WHERE user_id = OLD.id
  FOR UPDATE
  ON CONFLICT (id) DO UPDATE SET refresh_token = EXCLUDED.refresh_token,
    attempts = 0, next_attempt_at = now() + interval '2 minutes', last_error = NULL;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION eddy_private.queue_apple_revocation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER queue_apple_revocation_before_delete
  BEFORE DELETE ON auth.users FOR EACH ROW
  EXECUTE FUNCTION eddy_private.queue_apple_revocation();

COMMENT ON TABLE public.apple_token_revocations IS
  'Temporary credentials for deleted accounts. Service-role only; remove after successful Apple revocation. Never log tokens.';
COMMIT;
