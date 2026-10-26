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
//                 file AND the link text. Messages sends both, so a recipient
//                 gets the picture and a way back to the live view.
//
// Image preparation needs the network; link sharing never waits for it. A
// failure to PREPARE the image is reported, because the user is left with
// nothing to share. A failure or cancel inside the share sheet is not.

import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, Share, StyleSheet, Text } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { chartImagePath, chartSharePath, chartShareTitle, type ChartShareState } from '@eddy/conditions/chart-share';
import { ControlIcon } from '@/components/ControlIcon';
import { shareLink, webUrl } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function ChartShareControl({ state, stationName }: { state: ChartShareState | null; stationName?: string | null }) {
  const { colors, isDark } = useTheme();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  function shareChartLink(snapshot: ChartShareState) {
    void shareLink(chartShareTitle(stationName, snapshot), chartSharePath(snapshot));
  }

  async function shareImage(snapshot: ChartShareState) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let file: File | null = null;
    try {
      const response = await fetch(webUrl(chartImagePath(snapshot)), { signal: controller.signal });
      if (response.status === 422) throw new Error('saved_view_unavailable');
      if (!response.ok || !response.headers.get('content-type')?.includes('image/png'))
        throw new Error('Image unavailable');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!mounted.current || controller.signal.aborted) return;
      file = new File(Paths.cache, `eddy-chart-${snapshot.siteId}-${Date.now()}.png`);
      file.write(bytes);
      clearTimeout(timeout);
      if (mounted.current) setBusy(false);
      const title = chartShareTitle(stationName, snapshot);
      try {
        await Share.share({ title, url: file.uri, message: `${title}\n${webUrl(chartSharePath(snapshot))}` });
      } catch {
        // As in shareLink: a share-sheet failure costs nothing the user cannot retry.
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        Alert.alert(
          'Image unavailable',
          error instanceof Error && error.message === 'saved_view_unavailable'
            ? 'This saved chart view is no longer available. Open the gauge for current conditions.'
            : 'Could not prepare this image. Check your connection and try again, or share the link instead.',
        );
      }
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      request.current = null;
      if (mounted.current) setBusy(false);
      try {
        if (file?.exists) file.delete();
      } catch {
        /* cache cleanup is best effort */
      }
    }
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
      else if (index === 1) void shareImage(snapshot);
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
