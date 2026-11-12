import { useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text } from 'react-native';
import { damScheduleFileName, damScheduleImagePath, damScheduleTitle, scheduleShareDate } from '@eddy/conditions/dam-schedule-share';
import { ControlIcon } from '@/components/ControlIcon';
import { useShareImage } from '@/hooks/useShareImage';
import { webUrl } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function DamScheduleShareControl({ damId, name, dates }: { damId: string; name: string; dates: string[] }) {
  const { colors, isDark } = useTheme();
  const { shareImage } = useShareImage();
  const active = useRef(false);
  const [busy, setBusy] = useState(false);

  function open(target: number) {
    if (active.current || !dates.length) return;
    active.current = true;
    const anchor = Number.isFinite(target) && target > 0 ? target : undefined;
    const choices = [...dates];
    const linkPath = `/dams/${encodeURIComponent(damId)}#generation`;
    async function selected(index: number) {
      try {
        if (index >= 0 && index < choices.length) {
          setBusy(true);
          const date = choices[index];
          await shareImage({
            imagePath: damScheduleImagePath(damId, date),
            fileName: damScheduleFileName(damId, date),
            title: damScheduleTitle(name, date),
            linkPath: () => linkPath,
            anchor,
            failureMessage: status => status === 410 || status === 422 ? 'This dated schedule is unavailable. Open the dam for the latest schedule.' : null,
            defaultFailure: 'Could not prepare this schedule image. Check your connection and try again, or share the dam link.',
          });
        } else if (index === choices.length) {
          const url = webUrl(linkPath);
          await Share.share({ title: name, url, message: `${name}\n${url}` }, { anchor });
        }
      } catch {
        // Dismissing the system share sheet leaves the schedule in place.
      } finally {
        active.current = false;
        setBusy(false);
      }
    }
    if (Platform.OS !== 'ios') { void selected(choices.length); return; }
    ActionSheetIOS.showActionSheetWithOptions({
      title: 'Share schedule', message: `${name} · Central Time`, anchor,
      tintColor: colors.interactive, userInterfaceStyle: isDark ? 'dark' : 'light',
      options: [...choices.map(date => `${scheduleShareDate(date)} image`), 'Share dam link', 'Cancel'],
      cancelButtonIndex: choices.length + 1,
    }, index => { void selected(index); });
  }

  if (!dates.length) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Preparing schedule image' : `Share ${name} generation schedule`}
    accessibilityHint="Choose a date to share its image, or share the dam link"
    accessibilityState={{ disabled: busy, busy }} disabled={busy}
    onPress={event => open(Number(event.nativeEvent.target))}
    style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.cardRaised : colors.card, borderColor: colors.borderStrong, opacity: pressed ? 0.7 : 1 }]}
  >
    {busy ? <ActivityIndicator color={colors.interactive} size="small" /> : <ControlIcon name="share-outline" size={18} color={colors.interactive} />}
    <Text style={[styles.label, { color: colors.interactive }]}>{busy ? 'Preparing…' : 'Share'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 },
  label: { ...t.sm, fontFamily: fonts.medium },
});
