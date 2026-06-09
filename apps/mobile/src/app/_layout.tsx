import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/lib/auth-context';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="rivers/[slug]" options={{ title: 'River' }} />
          <Stack.Screen name="gauges/[siteId]" options={{ title: 'Gauge' }} />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
