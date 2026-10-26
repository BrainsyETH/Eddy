import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import { chartImagePath, chartSharePath, type ChartShareState } from '@eddy/conditions/chart-share';
import { GaugeChartSheet } from '@/components/GaugeChartSheet';
import { webUrl } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function ChartShareControl({ state }: { state: ChartShareState | null }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<File | null>(null);
  const inFlight = useRef(false);
  const sharing = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(
    () => () => {
      try {
        if (preview?.exists) preview.delete();
      } catch {
        /* cache cleanup is best effort */
      }
    },
    [preview],
  );
  async function shareLink() {
    if (!state || sharing.current) return;
    sharing.current = true;
    try {
      const url = webUrl(chartSharePath(state));
      await Share.share({ title: 'Eddy chart', url, message: `Eddy chart\n${url}` });
    } catch {
      Alert.alert('Sharing unavailable', 'Please try sharing the chart link again.');
    } finally {
      sharing.current = false;
    }
  }
  async function prepare() {
    if (!state || inFlight.current) return;
    // Serialize now. Changing chart controls while the network runs cannot alter this image.
    const path = chartImagePath(state);
    inFlight.current = true;
    setBusy(true);
    setPreview(null);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(webUrl(path), { signal: controller.signal });
      if (response.status === 422) throw new Error('saved_view_unavailable');
      if (!response.ok || !response.headers.get('content-type')?.includes('image/png'))
        throw new Error('Image unavailable');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!mounted.current || controller.signal.aborted) return;
      const file = new File(Paths.cache, `eddy-chart-${state.siteId}-${Date.now()}.png`);
      file.write(bytes);
      setPreview(file);
    } catch (error) {
      if (mounted.current && request.current === controller) {
        Alert.alert(
          'Image unavailable',
          error instanceof Error && error.message === 'saved_view_unavailable'
            ? 'This saved chart view is no longer available. Open the gauge for current conditions.'
            : 'Could not prepare this image. Check your connection and try again.',
        );
      }
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      request.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  async function shareImage() {
    if (!preview || sharing.current) return;
    sharing.current = true;
    try {
      await Share.share({ title: 'Eddy chart', url: preview.uri });
    } catch {
      Alert.alert('Sharing unavailable', 'Please try sharing this image again.');
    } finally {
      sharing.current = false;
    }
  }
  return (
    <>
      <ShareButton label="Share chart" onPress={() => setOpen(true)} disabled={!state} />
      {open && (
        <GaugeChartSheet
          expanded
          title="Share chart"
          onClose={() => {
            if (request.current) {
              request.current.abort();
              request.current = null;
            } else if (sharing.current) return;
            setOpen(false);
            setPreview(null);
          }}
        >
          <View style={styles.actions}>
            <ShareButton label="Share chart link" onPress={shareLink} disabled={!state} />
            <ShareButton
              label={busy ? 'Preparing image…' : 'Preview image'}
              onPress={prepare}
              disabled={!state || busy}
            />
          </View>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Links save fixed dates. Images require internet. USGS provisional values may be revised.
          </Text>
          {preview && (
            <>
              <Image
                source={{ uri: preview.uri }}
                accessibilityLabel="Preview of the chart image to share"
                style={styles.image}
                contentFit="contain"
              />
              <ShareButton label="Share this image" onPress={shareImage} />
            </>
          )}
        </GaugeChartSheet>
      )}
    </>
  );
}
function ShareButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.cardRaised, opacity: disabled ? 0.4 : pressed ? 0.65 : 1 },
      ]}
    >
      <Text style={[styles.text, { color: colors.interactive }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12 },
  text: { ...t.sm, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
  image: { width: '100%', aspectRatio: 1200 / 630 },
});
