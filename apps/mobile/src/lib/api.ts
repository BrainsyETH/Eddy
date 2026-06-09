// Singleton Eddy API client for the mobile app.
// Base URL comes from app.json `extra.apiBaseUrl` so dev builds can point at
// a local Next.js server (set EXPO_PUBLIC_API_BASE_URL to override).

import Constants from 'expo-constants';

import { createEddyApiClient } from '@eddy/shared/api';

const baseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'https://eddy.guide';

export const api = createEddyApiClient({ baseUrl });
