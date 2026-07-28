// src/lib/push/expo.ts
// Expo push transport. Deliberately dependency-free: expo-server-sdk would pull
// a package in for what is one HTTP endpoint, and injecting fetch here lets the
// whole module be unit-tested offline.
//
// Reference: https://docs.expo.dev/push-notifications/sending-notifications/
//
// TWO STEPS, NOT ONE. A ticket only says Expo accepted the message for
// delivery; whether APNs actually took it arrives later, in a RECEIPT. That is
// where `DeviceNotRegistered` usually shows up, so ticket-level pruning alone
// leaks dead tokens and the owner silently stops receiving alerts with nothing
// to see anywhere. `fetchExpoReceipts` is the second half, polled by
// /api/cron/push-receipts. Receipts live for 24h.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

/** Expo's documented maximum messages per request. */
export const EXPO_BATCH_SIZE = 100;

/** Expo's documented maximum receipt ids per request. */
export const EXPO_RECEIPT_BATCH_SIZE = 1000;

export interface ExpoMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export type TicketErrorKind =
  | 'device_not_registered'
  | 'message_too_big'
  | 'message_rate_exceeded'
  | 'mismatched_credentials'
  | 'other';

/**
 * A delivery receipt. Same shape as a ticket minus the id — deliberately typed
 * separately so a caller cannot pass one where the other is meant, since a
 * receipt is the answer about a ticket rather than another ticket.
 */
export type ExpoReceipt = Omit<ExpoTicket, 'id'>;

export function classifyTicketError(ticket: ExpoTicket | ExpoReceipt): TicketErrorKind | null {
  if (ticket.status !== 'error') return null;
  switch (ticket.details?.error) {
    case 'DeviceNotRegistered':
      return 'device_not_registered';
    case 'MessageTooBig':
      return 'message_too_big';
    case 'MessageRateExceeded':
      return 'message_rate_exceeded';
    case 'MismatchedSenderId':
    case 'InvalidCredentials':
      return 'mismatched_credentials';
    default:
      return 'other';
  }
}

/** An Expo push token looks like ExponentPushToken[xxx] or ExpoPushToken[xxx]. */
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token.trim());
}

export function chunkMessages(
  messages: ExpoMessage[],
  size: number = EXPO_BATCH_SIZE
): ExpoMessage[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const chunks: ExpoMessage[][] = [];
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }
  return chunks;
}

export interface SendOptions {
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Retries for transient failures (429 / 5xx). */
  maxRetries?: number;
  /** Injected for tests so retries don't actually sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends ONE batch (<= EXPO_BATCH_SIZE). Returns tickets index-aligned with the
 * input so callers can map a ticket back to its device token.
 *
 * Never throws for a single bad token — a whole-request failure yields an error
 * ticket per message instead, so one poison message can't abort a fan-out.
 */
export async function sendExpoPush(
  messages: ExpoMessage[],
  options: SendOptions = {}
): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];

  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 2;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  // Enabling Expo's enhanced security means a leaked project id alone cannot
  // be used to send on our behalf.
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  let lastError = 'unknown error';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await doFetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });

      // Transient: back off and retry the whole batch.
      if (response.status === 429 || response.status >= 500) {
        lastError = `HTTP ${response.status}`;
        if (attempt < maxRetries) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        return errorTickets(messages, lastError);
      }

      const payload = await response.json().catch(() => null);

      // Whole-request rejection (bad auth, malformed body). Expo reports this
      // as a top-level `errors` array rather than per-message tickets.
      if (!response.ok || (payload?.errors && !payload?.data)) {
        const message = payload?.errors?.[0]?.message ?? `HTTP ${response.status}`;
        return errorTickets(messages, message);
      }

      const tickets = payload?.data;
      if (!Array.isArray(tickets)) {
        return errorTickets(messages, 'malformed response: missing data[]');
      }

      // Defensive: pad if Expo returns fewer tickets than messages so index
      // alignment (ticket[i] ↔ messages[i]) always holds for the caller.
      if (tickets.length < messages.length) {
        return [
          ...tickets,
          ...errorTickets(messages.slice(tickets.length), 'missing ticket in response'),
        ];
      }

      return tickets.slice(0, messages.length) as ExpoTicket[];
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
    }
  }

  return errorTickets(messages, lastError);
}

function errorTickets(messages: ExpoMessage[], message: string): ExpoTicket[] {
  return messages.map(() => ({ status: 'error' as const, message }));
}

/**
 * Asks Expo what became of previously issued tickets.
 *
 * Returns a map keyed by ticket id, and — importantly — a ticket that is ABSENT
 * from the response is not an error. Expo omits receipts that are not ready
 * yet, and drops them entirely after 24h. Treating a missing receipt as a
 * failure would disable working devices, which is the opposite of the job.
 *
 * Never throws: a whole-request failure yields an empty map, so the caller
 * leaves those tickets unchecked and tries them again on the next pass rather
 * than acting on an outage.
 */
export async function fetchExpoReceipts(
  ticketIds: string[],
  options: SendOptions = {}
): Promise<Map<string, ExpoReceipt>> {
  const out = new Map<string, ExpoReceipt>();
  if (ticketIds.length === 0) return out;

  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 2;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await doFetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: ticketIds }),
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        return out;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.data || typeof payload.data !== 'object') return out;

      // `data` is an object keyed by ticket id, not an array — so unlike the
      // send path there is no index alignment to defend.
      for (const [id, receipt] of Object.entries(payload.data as Record<string, unknown>)) {
        if (receipt && typeof receipt === 'object' && 'status' in receipt) {
          out.set(id, receipt as ExpoReceipt);
        }
      }
      return out;
    } catch {
      if (attempt < maxRetries) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
    }
  }

  return out;
}

export function chunkReceiptIds(
  ids: string[],
  size: number = EXPO_RECEIPT_BATCH_SIZE
): string[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}
