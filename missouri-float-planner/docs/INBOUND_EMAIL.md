# Inbound email (eddy.guide) via Resend

> **Status: active** — runbook for inbound *@eddy.guide mail via Resend.

How mail sent to `*@eddy.guide` reaches the app, and everything required to make
it work end to end. The admin panel receives mail and sends replies through the same Resend client.

## Flow

```
someone@example.com
        │  sends to hello@eddy.guide
        ▼
   eddy.guide MX record ──▶ Resend (inbound)
        │  POST, Svix-signed
        ▼
POST /api/webhooks/resend        (src/app/api/webhooks/resend/route.ts)
        │  1. verify signature (raw body + RESEND_WEBHOOK_SECRET)
        │  2. upsert envelope metadata          ─┐
        │  3. fetch full body via Received API   │ inbound_emails table
        ▼                                        ─┘ (migration 00169)
   Supabase: inbound_emails   ──▶  admin-only reads (RLS: is_admin())
```

## Two things that trip people up

1. **The webhook payload has no email body.** `email.received` includes only
   envelope metadata — `email_id`, `message_id`, `from`, `to`, `cc`, `bcc`,
   `received_for`, `subject`, and attachment *metadata*. The text/HTML body,
   headers, and attachment *contents* are **not** in the webhook. Fetch them
   separately with `resend.emails.receiving.get(email_id)` (done automatically
   in the route). A handler that just logs `event.data` and expects the message
   text will always see it empty.

2. **The endpoint must verify the signature against the raw body.** Resend signs
   with Svix (`svix-id` / `svix-timestamp` / `svix-signature` headers). The route
   reads `request.text()` and passes it to `resend.webhooks.verify()` — parsing
   JSON first would change the bytes and break verification. Without this, anyone
   who finds the URL can POST fake mail into the table.

## One-time setup

### 1. DNS — enable receiving (already done for eddy.guide)

In Resend → **Domains → eddy.guide**, turn on **Enable Receiving** and add the
generated **MX** record (`inbound-smtp.<region>.amazonses.com`) to the domain's
DNS in Vercel. Wait for it to verify. Only add this MX at the root if nothing
else receives mail there; otherwise use a subdomain (e.g. `inbound.eddy.guide`).

### 2. Create the webhook

Resend → **Webhooks → Add Webhook**:

- **Endpoint URL:** `https://eddy.guide/api/webhooks/resend`
- **Event:** `email.received`

After saving, open the webhook and copy its **Signing Secret** (`whsec_…`).

### 3. Environment variables

Set both in Vercel (Production + Preview) and in local `.env.local`:

| Variable | Where to get it | Used for |
| --- | --- | --- |
| `RESEND_API_KEY` | Resend → API Keys (`re_…`) | fetching the full body via the Received Emails API |
| `RESEND_WEBHOOK_SECRET` | Webhook details page (`whsec_…`) | verifying the Svix signature |

Both are required. If either is missing the route returns `500` and logs
`Missing RESEND_WEBHOOK_SECRET or RESEND_API_KEY` (fail-closed by design).

### 4. Run the migrations

Apply `supabase/migrations/00169_inbound_emails.sql` (the `inbound_emails`
table) and `00170_inbound_emails_replied_at.sql` (the `last_replied_at` column
used by replies), then regenerate DB types if you use them. Both are already
applied to the production project (`ilefwfpvphadsbptiaur`).

## Testing

1. Send an email to any address `@eddy.guide`.
2. In Resend → Webhooks, confirm the `email.received` delivery returned `200`.
3. Confirm a row landed in `inbound_emails` with `body_fetched = true` and the
   `text_body` / `html_body` populated.

To test signature rejection, `POST` to the endpoint without valid `svix-*`
headers — it should return `401`/`400`, not `200`.

## Replying

The admin panel sends replies through Resend's sending API. Resend also offers
a separate Inboxes product with a compose/reply UI; Eddy currently uses the
Receiving webhook integration described here.

- Expand a message in **Feedback → Inbound Email** and click **Reply**. Compose
  in the **rich-text editor** (bold, links, lists, headings) or pick a
  **quick-reply template** from the dropdown (`src/lib/email/reply-templates.ts`)
  and edit it. The reply is sent from eddy.guide via `resend.emails.send()`,
  threaded to the original (`In-Reply-To` / `References` headers), with the
  original quoted underneath.
- **Branding:** the body is sanitized (`sanitizeRichText`) and wrapped in the
  Eddy email shell (`src/lib/email/render.ts` — deep-teal header, otter logo,
  river-blue links) matching the marketing emails, and sent with a plain-text
  fallback.
- **From address:** defaults to the eddy.guide address the message was delivered
  to (e.g. a message to `hello@eddy.guide` is replied to *from* `hello@eddy.guide`).
  If the message wasn't addressed to an eddy.guide address, set `RESEND_REPLY_FROM`.
- **Requires the domain to be verified for _sending_** in Resend (DKIM/SPF), not
  just receiving. Sending a reply also marks the message read and flags it
  **Replied**.
- Endpoint: `POST /api/admin/inbound-emails/[id]/reply`.

## Feedback conversations

Deploy the feedback conversation migration before deploying this feature.
Consult `supabase/production-migrations.txt` for its applied/pending state,
and record the actual production migration version after applying it.

Form feedback is stored in `feedback`, separately from email. Expand a feedback
card in `/admin/feedback` to see **Conversation → Reply**. The composer shares
the inbound email editor/templates and Eddy branding. It defaults to
`Evan from Eddy <hello@eddy.guide>`; `RESEND_REPLY_FROM` may override this with a
verified address on `eddy.guide`. The recipient comes only from the saved
feedback record. Sending does not change Pending/Reviewed/Resolved/Dismissed.

- **History:** `feedback_email_replies` stores outgoing content, timestamps,
  Resend ID, and sending outcome. `Sent` means Resend accepted the message,
  not that delivery to the recipient's inbox was confirmed. Old outbound
  messages sent before this feature cannot be reconstructed from the existing
  `last_replied_at` timestamp.
- **Follow-ups:** each feedback row has a random `email_thread_token`. The
  outgoing `Reply-To` is `feedback+<token>@eddy.guide`. The verified receiving
  webhook associates the message only if exactly one token matches and its
  sender matches the original feedback email. It never matches by subject or
  sender alone. Other mail remains in Inbound Email. Existing catch-all domain
  receiving must continue to accept these addresses; no new mailbox is needed.
- **Inbox navigation:** linked mail offers **Open feedback conversation**. The
  destination includes `?feedbackId=<id>` and loads that exact feedback,
  including older or resolved items outside the normal first 100 results.
  All replies to linked mail go through the feedback endpoint to preserve
  the shared history. The normal inbound-mail reply endpoint refuses these.
- **Retries:** save an immutable send snapshot before calling Resend. A draft
  UUID becomes the provider idempotency key. Double clicks, network timeouts,
  and failed DB writes after acceptance retry that same snapshot. A partial
  unique index allows only one uncertain send per conversation. Use **Retry
  saved reply** instead of composing another message. Automatic retries stop
  after 23 hours, before Resend's 24-hour deduplication window expires. If a
  send stays uncertain after that, inspect Resend and reconcile the saved row
  before attempting another reply; do not blindly reset its status.
- **Privacy:** the new history table has RLS enabled and all public/anonymous/
  authenticated grants revoked. Only the service role can access it, behind
  the existing admin authentication and same-origin write checks.

### Verification and rollout

1. Apply the pending migration to the intended database, recording the actual
   production version if applicable. Check migration drift with `make check-db`.
2. Confirm `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, sending-domain DKIM/SPF,
   and receiving MX/catch-all setup. Keep the `email.received` subscription;
   this feature does not migrate to Resend Inboxes events.
3. Use a feedback entry with an email address you control. Send a reply, refresh
   to confirm history, and reply from that mailbox. Verify the response appears
   under the same feedback and links from Inbound Email. Verify status remains
   unchanged. Also verify a regular, unlinked inbound email can still be replied
   to using its existing composer.
4. Check the `Sent` provider ID in Resend for actual delivery or bounce status.

Automated behavior/auth/webhook tests: `src/lib/email/feedback-mail.test.ts`
(registered in `npm test`). These use test mail and never contact real users.

## Behavior notes

- **Idempotent:** rows are upserted on `email_id` (`ignoreDuplicates`), so a
  redelivered webhook is a no-op — Resend can retry safely.
- **Resilient body fetch:** the envelope is saved first. A failed body fetch,
  body save, or feedback link returns `503` so Resend retries. Repeated webhook
  deliveries preserve read/archive/spam state. If retries are exhausted, replay
  the failed event from Resend after resolving the error.
- **Attachments:** only metadata is stored. Fetch binary content on demand via
  the Attachments API (`resend.emails.receiving.attachments.get`).
- **Access:** the table is admin-only (RLS `is_admin()`); only the webhook, via
  the service-role client, writes to it.
- **Reading it:** received mail shows up in the admin panel under
  **Feedback → Inbound Email** (`/admin/feedback`), with unread/read/archive/spam
  triage and a Reply button. The tab shows a badge with the unread count.

## Files

- `src/app/api/webhooks/resend/route.ts` — the webhook receiver
- `src/lib/email/resend.ts` — shared Resend client
- `supabase/migrations/00169_inbound_emails.sql` — the `inbound_emails` table
- `src/app/api/admin/inbound-emails/route.ts` + `[id]/route.ts` — admin list / triage API
- `src/components/admin/InboundEmailList.tsx` — the admin inbox UI (Feedback tab)
