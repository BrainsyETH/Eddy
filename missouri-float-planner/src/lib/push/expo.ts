// src/lib/push/expo.ts
// Expo push transport. Deliberately dependency-free: expo-server-sdk would pull
// a package in for what is one HTTP endpoint, and injecting fetch here lets the
// whole module be unit-tested offline.
//
// Reference: https://docs.expo.dev/push-notifications/sending-notifications/
//
// KNOWN LIMITATION (v1): `DeviceNotRegistered` most often arrives in the
// RECEIPT, not the ticket, so ticket-level pruning alone leaks dead tokens over
// time. We prune on ticket-level DeviceNotRegistered and additionally disable a
// token once failure_count crosses a threshold. Polling /push/getReceipts is a
// follow-up; receipts live for 24h.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo's documented maximum messages per request. */
export const EXPO_BATCH_SIZE = 100;

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

export function classifyTicketError(ticket: ExpoTicket): TicketErrorKind | null {
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
