// eddy-ios/src/components/PushDeliveryBanner.tsx
// One line above the alert list, only when nothing can reach this phone.
//
// ── The lie this ends ───────────────────────────────────────────────────────
// The Mine list drew "Never sent · watching since June" under every rule
// whether or not the phone could receive a push. Somebody who had declined the
// iOS prompt, stopped alerts on this device, or whose token never registered
// saw a list that read as WORKING — and the only way to learn otherwise was a
// river that crossed its line in silence.
//
// The banner names the one blocker that matters (the same precedence
// notificationDetail uses in Profile) and carries the action that clears it.
// Every row beneath it says "notifications off on this phone" so the two
// cannot disagree. It renders nothing while nothing is wrong, and nothing when
// there are no rules for it to be wrong about.

import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { NotificationPermission } from '@/lib/notificationCopy';

export interface PushDeliveryState {
  permission: NotificationPermission;
  optedOut: boolean;
  registered: boolean;
}

/** True when a push cannot currently reach this device. */
export function pushDeliveryBlocked(state: PushDeliveryState): boolean {
  if (state.permission === 'denied' || state.permission === 'unsupported') return true;
  if (state.permission === 'undetermined') return true;
  if (state.optedOut) return true;
  return !state.registered;
}

interface Copy {
  title: string;
  body: string;
  action: { label: string; kind: 'settings' | 'enable' | 'retry' } | null;
}

/**
 * What to say, and what to offer. Precedence matters: each case rules out the
 * ones below it, and the first blocker is the only one worth naming.
 */
export function pushDeliveryCopy(state: PushDeliveryState): Copy | null {
  if (state.permission === 'unsupported') {
    return {
      title: 'This device can’t receive push alerts',
      body: 'Your rules stay saved and Eddy keeps watching; a simulator has no way to be notified.',
      action: null,
    };
  }
  if (state.permission === 'denied') {
    return {
      title: 'Notifications are off for Eddy on this phone',
      body: 'Your rules are saved and Eddy is watching, but nothing can reach this phone until you allow notifications in Settings.',
      action: { label: 'Open Settings', kind: 'settings' },
    };
  }
  if (state.optedOut) {
    return {
      title: 'Notifications are paused on this phone',
      body: 'You stopped alerts on this device. Your rules are still set; turn them back on to be notified here.',
      action: { label: 'Turn on', kind: 'enable' },
    };
  }
  if (state.permission === 'undetermined') {
    return {
      title: 'Notifications haven’t been turned on yet',
      body: 'Your rules are saved, but this phone hasn’t been allowed to receive them. iOS will ask once.',
      action: { label: 'Turn on alerts', kind: 'enable' },
    };
  }
  if (!state.registered) {
    return {
      title: 'This phone isn’t registered for alerts yet',
      body: 'Notifications are allowed, but Eddy hasn’t been able to register this device. Try again on a connection.',
      action: { label: 'Retry', kind: 'retry' },
    };
  }
  return null;
}

export function PushDeliveryBanner({
  state,
  onEnable,
  onRetry,
}: {
  state: PushDeliveryState;
  onEnable: () => void;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const copy = pushDeliveryCopy(state);
  if (!copy) return null;

  const act = () => {
    if (!copy.action) return;
    if (copy.action.kind === 'settings') void Linking.openSettings();
    else if (copy.action.kind === 'enable') onEnable();
    else onRetry();
  };

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}
      accessibilityRole="alert"
    >
      <Ionicons name="notifications-off-outline" size={18} color={colors.text} style={styles.icon} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>{copy.body}</Text>
        {copy.action ? (
          <Pressable
            onPress={act}
            style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={copy.action.label}
          >
            <Text style={[styles.actionText, { color: colors.interactive }]}>
              {copy.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginTop: 1 },
  body: { flex: 1 },
  title: { ...t.sm, fontFamily: fonts.semibold },
  text: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  // A 44pt row for the one control on the banner.
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: 8 },
  actionText: { ...t.sm, fontFamily: fonts.semibold },
});
