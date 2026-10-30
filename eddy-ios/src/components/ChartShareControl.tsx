// eddy-ios/src/components/ChartShareControl.tsx
// The expanded chart's Share action.
//
// One system share glyph, one native action sheet, then the system share sheet.
// No intermediate screen: the share sheet already previews what it sends, and a
// full-screen modal over the full-screen chart for a two-way choice is the
// pattern the HIG steers away from.
//
//   Share Link  → shareLink(), the same helper every other screen uses, so the
//                 message, the preview-card url and the quiet cancel/failure
//                 behaviour all match.
//   Share Image → render the PNG on the server, then hand the system sheet the
//                 file AND the link text (useShareImage). Messages sends both,
//                 so a recipient gets the picture and a way back to the live view.
//
// Image preparation needs the network; link sharing never waits for it.

import { ActionSheetIOS, ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { chartImagePath, chartSharePath, chartShareTitle, type ChartShareState } from '@eddy/conditions/chart-share';
import { ControlIcon } from '@/components/ControlIcon';
import { useShareImage } from '@/hooks/useShareImage';
import { shareLink } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function ChartShareControl({ state, stationName }: { state: ChartShareState | null; stationName?: string | null }) {
  const { colors, isDark } = useTheme();
  const { busy, shareImage } = useShareImage();

  function shareChartLink(snapshot: ChartShareState) {
    void shareLink(chartShareTitle(stationName, snapshot), chartSharePath(snapshot));
  }

  function shareChartImage(snapshot: ChartShareState) {
    void shareImage({
      imagePath: chartImagePath(snapshot),
      fileName: `eddy-chart-${snapshot.siteId}`,
      title: chartShareTitle(stationName, snapshot),
      linkPath: () => chartSharePath(snapshot),
      failureMessage: (status) =>
        status === 422 ? 'This saved chart view is no longer available. Open the gauge for current conditions.' : null,
      defaultFailure: 'Could not prepare this image. Check your connection and try again, or share the link instead.',
    });
  }

  function open(target: number) {
    if (!state) return;
    // captureChart returns a new object each render, so holding this one freezes
    // the view: changing chart controls while the sheet is up cannot alter what is shared.
    const snapshot = state;
    if (Platform.OS !== 'ios') {
      shareChartLink(snapshot);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions({
      title: chartShareTitle(stationName, snapshot),
      message: 'Shares this exact view: dates, zoom and layers. USGS provisional values may be revised.',
      anchor: Number.isFinite(target) ? target : undefined,
      tintColor: colors.interactive,
      userInterfaceStyle: isDark ? 'dark' : 'light',
      options: ['Share Link', 'Share Image', 'Cancel'],
      cancelButtonIndex: 2,
    }, index => {
      if (index === 0) shareChartLink(snapshot);
      else if (index === 1) shareChartImage(snapshot);
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Preparing chart image' : 'Share this chart view'}
      accessibilityState={{ disabled: !state || busy, busy }}
      disabled={!state || busy}
      onPress={event => open(Number(event.nativeEvent.target))}
      style={({ pressed }) => [styles.action, { opacity: !state ? 0.4 : pressed ? 0.65 : 1 }]}
    >
      {busy
        ? <ActivityIndicator size="small" color={colors.interactive} />
        : <ControlIcon name="share-outline" size={16} color={colors.interactive} />}
      <Text style={[styles.text, { color: colors.interactive }]}>{busy ? 'Preparing…' : 'Share'}</Text>
    </Pressable>
  );
}

// Matches GaugeChart's toolbar actions, which this sits beside.
const styles = StyleSheet.create({
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4, flexShrink: 1 },
  text: { ...t.xs, fontFamily: fonts.medium, flexShrink: 1 },
});
