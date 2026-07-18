// src/lib/email/inbound.ts
// Shared mapping for inbound_emails rows → the InboundEmail API shape, used by
// the list, patch, and reply admin routes.

import type { InboundEmail } from '@/types/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapInboundEmailRow(row: any): InboundEmail {
  return {
    id: row.id,
    emailId: row.email_id,
    messageId: row.message_id,
    fromAddress: row.from_address,
    toAddresses: row.to_addresses ?? [],
    ccAddresses: row.cc_addresses ?? [],
    bccAddresses: row.bcc_addresses ?? [],
    receivedFor: row.received_for ?? [],
    replyTo: row.reply_to ?? [],
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body,
    attachments: row.attachments ?? [],
    bodyFetched: row.body_fetched ?? false,
    status: row.status,
    lastRepliedAt: row.last_replied_at ?? null,
    resendCreatedAt: row.resend_created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
