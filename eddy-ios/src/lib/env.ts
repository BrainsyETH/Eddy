function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://eddy.guide',
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  offlineStyleUrl: process.env.EXPO_PUBLIC_OFFLINE_STYLE_URL,
};
