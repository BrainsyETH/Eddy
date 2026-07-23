import PostHog from 'posthog-react-native';

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
export const posthog = key ? new PostHog(key, {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
}) : null;
