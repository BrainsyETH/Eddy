import type { ApiErrorBody, AppConfigResponse } from '@eddy/types';
import { env } from './env';
import { supabase } from './supabase';

export class EddyApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) { super(body.error); }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Eddy-Client', 'EddyiOS/1.0');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed', code: 'internal_error' })) as ApiErrorBody;
    throw new EddyApiError(response.status, body);
  }
  return response.json() as Promise<T>;
}

export const fetchAppConfig = () => apiFetch<AppConfigResponse>('/api/app-config');
