// eddy-ios/src/components/AlertOriginRow.tsx
// One quiet row at the top of a screen a push notification opened: the way
// back to the rule that fired it.
//
// ── The gap this closes ─────────────────────────────────────────────────────
// A push tap lands on the river or gauge screen, where alerts can only be
// toggled or CREATED — pausing or editing the rule that just buzzed the phone
// took back → Alerts tab → Mine → find the row. The person most likely to
// want an alert quieter is the one its notification just interrupted, and
// they were the farthest from the control.
//
// Rendered only when the route carries `alertId` — which only a notification
// tap supplies (see routeTo in usePush) — so ordinary navigation never shows
// it. `alertSource` rides along because the two rule tables share an id space
// only by accident: /alerts/[id] disambiguates on (id, source), the same pair
// alertRuleKey composes everywhere else.
//
// Styled as TailwaterStatusRow's hairline row, not a banner: it is a door,
// not an announcement.

import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function AlertOriginRow({
  alertId,
  alertSource,
}: {
  alertId?: string;
  alertSource?: string;
}) {
  const { colors } = useTheme();
  const router = useRouter();

  if (!alertId) return null;
  // Only the two sources the app knows. Anything else is a payload from a
  // future server; passing it through would just make /alerts/[id] miss.
  const source =
    alertSource === 'gauge' || alertSource === 'river_condition' ? alertSource : undefined;

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/alerts/[id]',
          params: { id: alertId, ...(source ? { source } : {}) },
        })
      }
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Opened from your alert. Manage this alert."
    >
      <Ionicons name="notifications-outline" size={15} color={colors.interactive} />
      <Text style={[styles.text, { color: colors.textMuted }]}>Opened from your alert</Text>
      <Text style={[styles.action, { color: colors.interactive }]}>Manage</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
    </Pressable>
  );
}

// Layout only — colours come from the theme inline.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  text: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  action: { ...t.sm, fontFamily: fonts.semibold },
});
