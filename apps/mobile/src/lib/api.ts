// Singleton Eddy API client for the mobile app.
// Base URL comes from app.json `extra.apiBaseUrl` so dev builds can point at
// a local Next.js server (set EXPO_PUBLIC_API_BASE_URL to override).

import Constants from 'expo-constants';

import { createEddyApiClient } from '@eddy/shared/api';

import { supabase } from '@/lib/supabase';

const baseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'https://eddy.guide';

export const api = createEddyApiClient({
  baseUrl,
  // Signed-in requests carry the Supabase access token so user-scoped
  // endpoints (e.g. /api/plan/mine) work and saves attach to the account.
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
});
