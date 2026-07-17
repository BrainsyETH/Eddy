-- supabase/migrations/00169_inbound_emails.sql
--
-- Store inbound email received at *@eddy.guide.
--
-- Mail addressed to the domain is delivered to Resend via the domain MX record
-- and pushed to POST /api/webhooks/resend as a signed `email.received` event.
-- The webhook itself carries only ENVELOPE METADATA (from/to/subject/ids) — the
-- body, headers, and attachment contents are fetched separately via Resend's
-- Received Emails API and backfilled into the *_body / headers / attachments
-- columns. `body_fetched` records whether that backfill has succeeded yet.
--
-- Rows are written exclusively by the webhook using the service-role client
-- (which bypasses RLS), so there is intentionally no anon/authenticated INSERT
-- policy — only admins may read or triage.

CREATE TABLE inbound_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Resend's identifier for the received message. This is the idempotency key:
    -- Resend may deliver the same webhook more than once, so the webhook upserts
    -- on email_id and ignores repeats.
    email_id TEXT NOT NULL UNIQUE,

    -- RFC Message-ID from the original message headers.
    message_id TEXT,

    -- Envelope (present in the webhook payload).
    from_address TEXT,
    to_addresses TEXT[] NOT NULL DEFAULT '{}',
    cc_addresses TEXT[] NOT NULL DEFAULT '{}',
    bcc_addresses TEXT[] NOT NULL DEFAULT '{}',
    -- The address(es) the message was actually delivered for (post-forwarding).
    received_for TEXT[] NOT NULL DEFAULT '{}',
    reply_to TEXT[] NOT NULL DEFAULT '{}',
    subject TEXT,

    -- Full content (NOT in the webhook — fetched via the Received Emails API).
    text_body TEXT,
    html_body TEXT,
    headers JSONB,
    -- Attachment metadata (id, filename, content_type, ...). Binary content is
    -- retrieved on demand via the Attachments API, not stored here.
    attachments JSONB NOT NULL DEFAULT '[]',
    -- FALSE until the body/attachment backfill succeeds; lets a later job retry
    -- messages whose content fetch failed at receive time.
    body_fetched BOOLEAN NOT NULL DEFAULT FALSE,

    -- Verbatim verified webhook payload, kept for debugging / reprocessing.
    raw_event JSONB,

    -- Triage state for the admin inbox.
    status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived', 'spam')),

    -- When Resend recorded the inbound message (event data.created_at).
    resend_created_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the admin inbox and per-mailbox lookups.
CREATE INDEX idx_inbound_emails_status ON inbound_emails(status);
CREATE INDEX idx_inbound_emails_created_at ON inbound_emails(created_at DESC);
CREATE INDEX idx_inbound_emails_from ON inbound_emails(from_address);
CREATE INDEX idx_inbound_emails_received_for ON inbound_emails USING GIN (received_for);

-- Documentation.
COMMENT ON TABLE inbound_emails IS 'Emails received at *@eddy.guide via the Resend inbound webhook';
COMMENT ON COLUMN inbound_emails.email_id IS 'Resend email id; idempotency key for redelivered webhooks';
COMMENT ON COLUMN inbound_emails.received_for IS 'Address(es) the message was delivered for (post-forwarding)';
COMMENT ON COLUMN inbound_emails.attachments IS 'Attachment metadata only; binary content fetched on demand via the Attachments API';
COMMENT ON COLUMN inbound_emails.body_fetched IS 'Whether text/html/headers/attachments were successfully backfilled from the Received Emails API';
COMMENT ON COLUMN inbound_emails.raw_event IS 'Verbatim verified email.received webhook payload';
COMMENT ON COLUMN inbound_emails.status IS 'Triage state: unread, read, archived, spam';

-- Keep updated_at current on every write.
CREATE OR REPLACE FUNCTION update_inbound_emails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inbound_emails_updated_at
    BEFORE UPDATE ON inbound_emails
    FOR EACH ROW
    EXECUTE FUNCTION update_inbound_emails_updated_at();

-- RLS: admin-only. The webhook writes with the service-role key (bypasses RLS),
-- so no INSERT policy is granted to anon/authenticated — nobody else can write.
ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;

-- Only admins can read received mail.
CREATE POLICY inbound_emails_select_policy ON inbound_emails
    FOR SELECT
    TO authenticated
    USING (is_admin());

-- Only admins can triage (mark read/archived/spam).
CREATE POLICY inbound_emails_update_policy ON inbound_emails
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Only admins can delete.
CREATE POLICY inbound_emails_delete_policy ON inbound_emails
    FOR DELETE
    TO authenticated
    USING (is_admin());
