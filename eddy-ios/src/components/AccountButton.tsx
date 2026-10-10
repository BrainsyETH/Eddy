// The way into Account & Settings, now that Settings is not a tab.
//
// Today and Favorites carry it in their upper-right corner. It pushes /profile
// onto the current tab's stack, so Back returns to where you were. It never
// depends on sign-in state: the screen behind it is where you sign in.

import { Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';

const LABEL = 'Account and settings';

/** For screens with a native iOS header (Today). */
export function AccountToolbarButton() {
  const router = useRouter();
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="person.crop.circle" accessibilityLabel={LABEL} onPress={() => router.push('/profile')}>
        Settings
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}

/** For screens that draw their own title row (Favorites, non-iOS Today). */
export function AccountIconButton() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      hitSlop={8}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={LABEL}
    >
      <ControlIcon name="person-circle-outline" size={28} color={colors.interactive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
});
