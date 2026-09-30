import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

// One modal at the root, with real push/back navigation inside it. The group
// does not change /alerts/new or /alerts/configure (including direct links).
export default function AlertCreationLayout() {
  const { colors } = useTheme();
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{
        headerBackButtonDisplayMode: 'generic',
        contentStyle: { backgroundColor: colors.bg },
      }}>
        <Stack.Screen name="new" options={{ title: 'Choose water' }} />
        <Stack.Screen name="configure" options={{ title: 'New alert' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
