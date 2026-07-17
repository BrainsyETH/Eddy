# Inbound email (eddy.guide) via Resend

How mail sent to `*@eddy.guide` reaches the app, and everything required to make
it work end to end. This is inbound only — receiving mail, not sending it.

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

### 4. Run the migration

Apply `supabase/migrations/00169_inbound_emails.sql` to create the
`inbound_emails` table, then regenerate DB types if you use them.

## Testing

1. Send an email to any address `@eddy.guide`.
2. In Resend → Webhooks, confirm the `email.received` delivery returned `200`.
3. Confirm a row landed in `inbound_emails` with `body_fetched = true` and the
   `text_body` / `html_body` populated.

To test signature rejection, `POST` to the endpoint without valid `svix-*`
headers — it should return `401`/`400`, not `200`.

## Replying

Resend's dashboard only lets you *view* received mail — it has no compose/reply
button. Replies are sent programmatically via the sending API, which the admin
panel does for you:

- Expand a message in **Feedback → Inbound Email** and click **Reply**. The reply
  is sent from eddy.guide via `resend.emails.send()`, threaded to the original
  (`In-Reply-To` / `References` headers), with the original quoted underneath.
- **From address:** defaults to the eddy.guide address the message was delivered
  to (e.g. a message to `hello@eddy.guide` is replied to *from* `hello@eddy.guide`).
  If the message wasn't addressed to an eddy.guide address, set `RESEND_REPLY_FROM`.
- **Requires the domain to be verified for _sending_** in Resend (DKIM/SPF), not
  just receiving. Sending a reply also marks the message read and flags it
  **Replied**.
- Endpoint: `POST /api/admin/inbound-emails/[id]/reply`.

## Behavior notes

- **Idempotent:** rows are upserted on `email_id` (`ignoreDuplicates`), so a
  redelivered webhook is a no-op — Resend can retry safely.
- **Resilient body fetch:** if `resend.emails.receiving.get()` fails, the
  envelope row is still stored with `body_fetched = false` and the webhook still
  returns `200`; a later job can retry the fetch.
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
