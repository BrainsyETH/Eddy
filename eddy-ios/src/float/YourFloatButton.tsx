import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { ControlIcon } from '@/components/ControlIcon';
import { FloatActionIcon } from '@/components/FloatActionIcon';
import { useFloatSession, useFloatSessionUnreadable } from '@/hooks/useFloatSession';
import { useFloatDisplayClock } from '@/hooks/useFloatDisplayClock';
import { useNavigationAction } from '@/hooks/useNavigationAction';
import { activeFloatStatus } from '@/lib/floatDisplay';
import { trackerStatus } from '@/lib/floatTrackerStatus';
import { selectionFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { activeFloatColors } from '@/theme/float';
import { fonts, type as t } from '@/theme/typography';
import { FloatStatusDot } from './FloatStatusDot';

/** One active-session entry, independent of new-start flags. Sheets can supply their dismissal-aware navigation. */
export function YourFloatButton({ compact = false, style, onPress }: { compact?: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const session = useFloatSession();
  const { unreadable } = useFloatSessionUnreadable();
  const tracker = useSyncExternalStore(trackerStatus.subscribe, trackerStatus.get, trackerStatus.get);
  const focused = useIsFocused();
  const now = useFloatDisplayClock(focused && !!session);
  const router = useRouter();
  const navigate = useNavigationAction();
  const { colors, elevation, floating } = useTheme();
  if (!session && !unreadable) return null;
  const status = session ? activeFloatStatus(session, tracker, now) : { label: 'Tracking needs attention', healthy: false, at: null };
  const appearance = activeFloatColors(colors, status.healthy);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your Float. ${status.label}`}
      accessibilityHint="Opens your current float"
      onPress={() => navigate(() => { selectionFeedback(); if (onPress) onPress(); else router.push('/float-mode'); })}
      style={({ pressed }) => [styles.button, compact && styles.compact, compact ? floating() : elevation(1),
        { backgroundColor: appearance.backgroundColor, borderColor: appearance.borderColor, opacity: pressed ? 0.8 : 1 }, style]}
    >
      {compact ? (
        <>
          <View style={styles.compactHeader}>
            <FloatActionIcon name="startFloat" size={24} color={appearance.ink} />
            <Text style={[styles.title, styles.compactTitle, styles.grow, { color: colors.text }]}>Your Float</Text>
            <ControlIcon name="chevron-forward" size={14} color={appearance.ink} />
          </View>
          <View style={styles.status}>
            <FloatStatusDot at={status.at} fresh={status.healthy && focused} color={appearance.ink} />
            <Text style={[styles.subtitle, { color: appearance.textColor }]}>{status.label}</Text>
          </View>
        </>
      ) : (
        <>
          <FloatActionIcon name="startFloat" size={40} color={appearance.ink} />
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.text }]}>Your Float</Text>
            <View style={styles.status}>
              <FloatStatusDot at={status.at} fresh={status.healthy && focused} color={appearance.ink} />
              <Text style={[styles.subtitle, { color: appearance.textColor }]}>{status.label}</Text>
            </View>
          </View>
          <ControlIcon name="chevron-forward" size={16} color={appearance.ink} />
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 80, borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compact: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  compactHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grow: { flex: 1 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...t.xl, fontFamily: fonts.display },
  compactTitle: { ...t.base, fontFamily: fonts.display },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subtitle: { ...t.xs, fontFamily: fonts.medium, flex: 1 },
});
