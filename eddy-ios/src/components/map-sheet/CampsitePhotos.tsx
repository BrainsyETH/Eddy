import { ScenicImage } from '@/components/ScenicImage';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ControlIcon } from '@/components/ControlIcon';
import type { CampsitePhoto } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** A separate target from booking: opening a photo never opens Safari. */
export function CampsitePhotos({
  photos,
  label,
  large = false,
  compact = false,
}: {
  photos: CampsitePhoto[];
  label: string;
  large?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [viewport, setViewport] = useState({ width: 1, height: 240 });
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [index, setIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const thumbnail = photos.find((photo) => !failed.includes(photo.url));
  const selected = index === null ? null : photos[index];
  const imageHeight = Math.min(width / (ratios[selected?.url ?? ''] ?? 4 / 3), height * 0.55);
  const rememberRatio = (url: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const ratio = width / height;
    setRatios(current => current[url] === ratio ? current : { ...current, [url]: ratio });
  };
  const fail = (url: string) =>
    setFailed((current) =>
      current.includes(url) ? current : [...current, url],
    );
  if (!thumbnail && !selected) return null;

  return (
    <>
      {thumbnail ? (
        <Pressable
          style={large ? styles.large : compact ? styles.compact : styles.thumbnail}
          onPress={() => setIndex(photos.indexOf(thumbnail))}
          accessibilityRole="button"
          accessibilityLabel={`View ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} of ${label}`}
        >
          <ScenicImage
            imageWidth={large ? 1080 : 256}
            source={{ uri: thumbnail.url }}
            style={large ? styles.large : compact ? styles.compact : styles.thumbnail}
            contentFit="cover"
            onError={() => fail(thumbnail.url)}
            onLoad={({ source }) => rememberRatio(thumbnail.url, source.width, source.height)}
            accessible={false}
          />
        </Pressable>
      ) : null}
      <Modal
        visible={selected !== null}
        transparent
        animationType={reducedMotion ? 'none' : 'fade'}
        presentationStyle="overFullScreen"
        onRequestClose={() => setIndex(null)}
      >
        <SafeAreaProvider>
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.anchor} pointerEvents="box-none">
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={() => setIndex(null)} accessible={false} />
        <SafeAreaView
          edges={['bottom']}
          style={[styles.viewer, { backgroundColor: colors.sheetGrouped }]}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setIndex(null)}
        >
          <View style={styles.header}>
            <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>{label}</Text>
            <Pressable
              onPress={() => setIndex(null)}
              style={styles.control}
              accessibilityRole="button"
              accessibilityLabel="Close photos"
            >
              <ControlIcon name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          {selected ? (
            <>
              {failed.includes(selected.url) ? (
                <View style={[styles.unavailable, { height: Math.min(imageHeight, 160) }]}>
                  <Text style={{ color: colors.textMuted }}>
                    This photo couldn’t load.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  key={`image:${selected.url}`}
                  style={[styles.imageArea, { height: imageHeight }]}
                  contentContainerStyle={styles.imageContent}
                  minimumZoomScale={1}
                  maximumZoomScale={3}
                  showsVerticalScrollIndicator={false}
                  showsHorizontalScrollIndicator={false}
                  onLayout={(event) => setViewport(event.nativeEvent.layout)}
                >
                  <ScenicImage
                    imageWidth={1920}
                    source={{ uri: selected.url }}
                    style={{ width: viewport.width, height: viewport.height }}
                    contentFit="contain"
                    accessibilityLabel={selected.title || `Photo of ${label}`}
                    onError={() => fail(selected.url)}
                    onLoad={({ source }) => rememberRatio(selected.url, source.width, source.height)}
                  />
                </ScrollView>
              )}
              <ScrollView key={`caption:${selected.url}`} style={{ maxHeight: height * 0.25, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.caption}>
                <PhotoCaption photo={selected} />
              </ScrollView>
              <Text style={[styles.credit, { color: colors.textMuted }]}>
                {selected.credit ? `${selected.credit} · ` : ''}{selected.source ?? 'Recreation.gov'}
              </Text>
              <View style={styles.navigation}>
                <Pressable
                  style={styles.control}
                  disabled={index === 0}
                  onPress={() => setIndex((index ?? 0) - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous photo"
                  accessibilityState={{ disabled: index === 0 }}
                >
                  <ControlIcon
                    name="chevron-back"
                    size={24}
                    color={index === 0 ? colors.textSubtle : colors.text}
                  />
                </Pressable>
                <Text style={{ color: colors.text }}>
                  {(index ?? 0) + 1} of {photos.length}
                </Text>
                <Pressable
                  style={styles.control}
                  disabled={index === photos.length - 1}
                  onPress={() => setIndex((index ?? 0) + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Next photo"
                  accessibilityState={{ disabled: index === photos.length - 1 }}
                >
                  <ControlIcon
                    name="chevron-forward"
                    size={24}
                    color={
                      index === photos.length - 1
                        ? colors.textSubtle
                        : colors.text
                    }
                  />
                </Pressable>
              </View>
            </>
          ) : null}
        </SafeAreaView>
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

function PhotoCaption({ photo }: { photo: CampsitePhoto }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  return <>
    {photo.title ? <View>
      {/* Measure the full caption once; the visible copy stays short until requested. */}
      <Text accessible={false} pointerEvents="none" style={[styles.captionText, styles.measureCaption]}
        onTextLayout={event => setOverflows(event.nativeEvent.lines.length > 2)}>{photo.title}</Text>
      <Text numberOfLines={expanded ? undefined : 2} style={[styles.captionText, { color: colors.text }]}>{photo.title}</Text>
      {overflows ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)} style={styles.captionToggle}>
        <Text style={[styles.captionText, { color: colors.interactive }]}>{expanded ? 'Less' : 'Full caption'}</Text>
      </Pressable> : null}
    </View> : null}
  </>;
}

const styles = StyleSheet.create({
  large: {
    width: '100%',
    aspectRatio: 1.6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnail: { width: 68, height: 54, borderRadius: 8, overflow: 'hidden' },
  compact: { width: 88, height: 88, borderRadius: 10, overflow: 'hidden' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  viewer: { maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  title: { ...t.lg, fontFamily: fonts.semibold, flex: 1 },
  control: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageArea: { flexShrink: 1, minHeight: 60 },
  imageContent: { flexGrow: 1 },
  unavailable: { flexShrink: 1, justifyContent: 'center', alignItems: 'center' },
  caption: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  captionText: { ...t.sm, fontFamily: fonts.body },
  measureCaption: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  captionToggle: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  credit: { ...t.xs, fontFamily: fonts.body, marginTop: 4, paddingHorizontal: 16 },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
});
