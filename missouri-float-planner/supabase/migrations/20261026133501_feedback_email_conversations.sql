-- Feedback conversations use an unguessable reply address, not a subject or
-- sender-only match. No public client may read the token or the outgoing mail.
ALTER TABLE public.feedback ADD COLUMN email_thread_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX feedback_email_thread_token_key ON public.feedback(email_thread_token);

ALTER TABLE public.inbound_emails ADD COLUMN feedback_id uuid REFERENCES public.feedback(id) ON DELETE SET NULL;
CREATE INDEX inbound_emails_feedback_created_idx ON public.inbound_emails(feedback_id, created_at) WHERE feedback_id IS NOT NULL;

CREATE TABLE public.feedback_email_replies (
  id uuid PRIMARY KEY,
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  content_html text NOT NULL,
  content_text text NOT NULL,
  -- Immutable send snapshot: retries must use the same payload/idempotency key.
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  resend_id text UNIQUE,
  message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CHECK (status <> 'sent' OR (resend_id IS NOT NULL AND sent_at IS NOT NULL))
);
CREATE INDEX feedback_email_replies_history_idx ON public.feedback_email_replies(feedback_id, created_at);
-- An uncertain send must be reconciled/retried before starting another reply.
CREATE UNIQUE INDEX feedback_email_replies_in_flight_idx ON public.feedback_email_replies(feedback_id) WHERE status = 'sending';
ALTER TABLE public.feedback_email_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_email_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_email_replies TO service_role;
COMMENT ON TABLE public.feedback_email_replies IS 'Admin-only outgoing feedback email and immutable retry payload; sent means accepted by Resend, not confirmed delivery';
