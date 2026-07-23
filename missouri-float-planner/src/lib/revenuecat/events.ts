export const REVENUECAT_APPLIED_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'TRANSFER',
]);

export interface RevenueCatEvent {
  id: string;
  type: string;
  event_timestamp_ms: number;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  product_id?: string | null;
  store?: string | null;
  environment?: string | null;
}

export interface RevenueCatPayload { event?: RevenueCatEvent }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuidCandidates(event: RevenueCatEvent): string[] {
  return Array.from(new Set([
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases || []),
  ].filter((value): value is string => !!value && UUID.test(value))));
}

export function transferredUuids(values: string[] | undefined): string[] {
  return Array.from(new Set((values || []).filter((value) => UUID.test(value))));
}

export function entitlementIds(event: RevenueCatEvent): string[] {
  const ids = event.entitlement_ids?.length
    ? event.entitlement_ids
    : event.entitlement_id
      ? [event.entitlement_id]
      : ['eddy_plus'];
  return Array.from(new Set(ids.filter(Boolean)));
}

export function eventDate(milliseconds: number | null | undefined): string | null {
  return typeof milliseconds === 'number' && Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

export function willRenewFor(type: string): boolean | null {
  if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION'].includes(type)) return true;
  if (['CANCELLATION', 'EXPIRATION'].includes(type)) return false;
  return null;
}

export function clearsBillingIssue(type: string): boolean {
  return ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED'].includes(type);
}
