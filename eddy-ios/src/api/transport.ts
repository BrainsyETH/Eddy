import Constants from 'expo-constants';

import { requestErrorMessage } from './request-error';

export const BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'https://eddy.guide';
export const USER_AGENT = 'EddyiOS/0.1';
export const REQUEST_TIMEOUT_MS = 15_000;
export const BACKGROUND_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function withDeadline(caller?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const state = { timedOut: false };
  if (caller?.aborted) controller.abort();
  const onCallerAbort = () => controller.abort();
  caller?.addEventListener('abort', onCallerAbort);
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    get timedOut() {
      return state.timedOut;
    },
    done() {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onCallerAbort);
    },
  };
}

export async function fetchOnce(
  url: string,
  deadline: ReturnType<typeof withDeadline>,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: deadline.signal });
  } catch (error) {
    throw new ApiError(requestErrorMessage(error, deadline.timedOut));
  } finally {
    deadline.done();
  }
}

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const deadline = withDeadline(signal);
  const response = await fetchOnce(`${BASE_URL}${path}`, deadline, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
  return (await response.json()) as T;
}

export async function authed<T>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T | null> {
  const deadline = withDeadline(init?.signal);
  const response = await fetchOnce(`${BASE_URL}${path}`, deadline, {
    method: init?.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
  return (await response.json()) as T;
}
