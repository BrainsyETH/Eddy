import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

export default function AlertManagementLayout() {
  const { colors } = useTheme();
  return <SafeAreaProvider>
    <Stack screenOptions={{ orientation: 'portrait', headerBackButtonDisplayMode: 'generic', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="quiet-hours" options={{ title: 'Quiet hours' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit alert' }} />
    </Stack>
  </SafeAreaProvider>;
}
