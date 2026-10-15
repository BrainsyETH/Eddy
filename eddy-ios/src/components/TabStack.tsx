import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { DETAIL_TITLES } from '@/lib/tabRoutes';

/** A separate native history for each tab, sharing the detail implementations. */
export function TabStack({ root, title }: { root: string; title: string }) {
  const { colors } = useTheme();
  return <Stack screenOptions={({ route }) => {
    const today = root === 'reports' && route.name === root;
    const detail = DETAIL_TITLES[route.name];
    return {
      headerShown: Boolean(detail) || (today && Platform.OS === 'ios'),
      title: detail ?? title,
      // Secondary guard. EddyPortraitRootViewController enforces the app's
      // default; changing this alone cannot unlock a tab screen.
      orientation: 'portrait',
      headerBackButtonDisplayMode: 'generic',
      headerLargeTitle: today,
      headerTransparent: Platform.OS === 'ios',
      headerBlurEffect: Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) < 26 ? 'systemMaterial' : undefined,
      contentStyle: { backgroundColor: colors.bg },
      // These must be set before the screen mounts. Changing header visibility
      // inside a native modal remounts its contents and restarts planner loads.
      ...(route.name === 'plan-route' ? {
        headerShown: false,
        gestureEnabled: false,
        animation: 'none' as const,
        presentation: 'transparentModal' as const,
        contentStyle: { backgroundColor: 'transparent' },
      } : {}),
    };
  }} />;
}
