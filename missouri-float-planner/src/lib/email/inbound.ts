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

type CountClient = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

/**
 * Global unread count for the Inbox badge. Callers return it with every write,
 * so the badge never has to be recomputed from whichever page is on screen.
 * Null when the count could not be read: the caller keeps the badge it had.
 */
export async function countUnreadInboundEmails(supabase: CountClient): Promise<number | null> {
  const { count, error } = await supabase
    .from('inbound_emails')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'unread');
  return error ? null : (count ?? 0);
}

export const INBOUND_EMAIL_STATUSES = ['unread', 'read', 'archived', 'spam'] as const;
/** Most a single bulk triage may touch: one page of the list. */
export const MAX_BULK_EMAILS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a bulk triage body: 1–100 message UUIDs (deduplicated) and one status. */
export function parseBulkEmailUpdate(
  body: unknown,
): { ids: string[]; status: (typeof INBOUND_EMAIL_STATUSES)[number] } | { error: string } {
  const b = (body ?? {}) as { ids?: unknown; status?: unknown };
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids)] : [];
  if (
    ids.length === 0 ||
    ids.length > MAX_BULK_EMAILS ||
    !ids.every((id) => typeof id === 'string' && UUID.test(id))
  )
    return { error: `Select between 1 and ${MAX_BULK_EMAILS} messages.` };
  if (!(INBOUND_EMAIL_STATUSES as readonly unknown[]).includes(b.status)) return { error: 'Invalid status' };
  return { ids: ids as string[], status: b.status as (typeof INBOUND_EMAIL_STATUSES)[number] };
}
