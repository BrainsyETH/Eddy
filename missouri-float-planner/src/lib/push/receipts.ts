import type { SupabaseClient } from '@supabase/supabase-js';
import type { TicketErrorKind } from './expo';

export interface DeliveryRow {
  event_id: string;
  device_token_id: string;
  ticket_id: string;
  sent_at: string;
}

/** Keep the receipt pending until both writes succeed so a poll can retry it. */
export async function recordPushReceipt(
  db: SupabaseClient,
  row: DeliveryRow,
  errorKind: TicketErrorKind | null,
): Promise<number> {
  const checkedAt = new Date().toISOString();
  let retired = 0;
  if (errorKind === 'device_not_registered') {
    const { data, error } = await db.from('device_tokens')
      .update({ disabled_at: checkedAt })
      .eq('id', row.device_token_id).is('disabled_at', null)
      .lte('last_seen_at', row.sent_at).select('id');
    if (error) throw error;
    retired = data?.length ?? 0;
  }

  const { error } = await db.from('alert_push_deliveries')
    .update({
      receipt_checked_at: checkedAt,
      ...(errorKind ? { status: 'error', error_code: errorKind } : {}),
    })
    .eq('event_id', row.event_id)
    .eq('device_token_id', row.device_token_id)
    .eq('ticket_id', row.ticket_id)
    .is('receipt_checked_at', null);
  if (error) throw error;
  return retired;
}
