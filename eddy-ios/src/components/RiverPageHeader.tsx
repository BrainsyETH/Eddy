import { useId, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { openExternalLink } from '@/lib/openExternalLink';
import { RIVER_TITLE_SHADE, type RiverHeaderPhoto } from '@/lib/riverHeader';
import { ScenicImage } from './ScenicImage';

function Shade({ from, to, height, above = false, color = 'black' }: { from: number; to: number; height: number; above?: boolean; color?: string }) {
  const id = useId().replace(/:/g, '');
  return <Svg width="100%" height={height} pointerEvents="none" accessible={false} viewBox="0 0 1 1" preserveAspectRatio="none"
    style={[styles.shade, { height, top: above ? -height : 0 }]}>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={color} stopOpacity={from} />
      <Stop offset="1" stopColor={color} stopOpacity={to} />
    </LinearGradient></Defs>
    <Rect width={1} height={1} fill={`url(#${id})`} />
  </Svg>;
}

/** Scenery is scrolling content; navigation remains the native iOS toolbar. */
export function RiverPageHeader({ name, meta, photo, topInset, horizontalInset = 16, creditPlacement = 'below', onPhotoError, onTitleBottom }: {
  name: string;
  meta: string;
  photo: RiverHeaderPhoto | null;
  topInset: number;
  horizontalInset?: number;
  creditPlacement?: 'below' | 'overlay';
  onPhotoError: (url: string) => void;
  onTitleBottom: (bottom: number) => void;
}) {
  const { colors, increaseContrast, reduceTransparency } = useTheme();
  const solid = increaseContrast || reduceTransparency;
  const overlayCredit = creditPlacement === 'overlay' && Boolean(photo?.credit);
  const measured = useRef({ root: null as number | null, block: null as number | null, title: null as number | null });
  function measure(part: 'root' | 'block' | 'title', value: number) {
    measured.current[part] = value;
    const { root, block, title } = measured.current;
    if (root !== null && block !== null && title !== null) onTitleBottom(root + block + title);
  }
  const ink = photo ? '#FFFFFF' : colors.text;
  const captionInk = solid ? '#FFFFFF' : 'rgba(255,255,255,0.84)';
  const creditLink = photo?.credit ? (
    <Pressable accessibilityRole="link" accessibilityLabel={`Photo credit: ${photo.credit.text}. Cropped for display. Opens source and license.`}
      onPress={() => void openExternalLink(photo.credit!.url)} style={overlayCredit ? styles.creditOverlay : styles.credit}>
      <Text style={[styles.creditText, overlayCredit ? { color: captionInk, textAlign: 'right' } : { color: colors.textMuted }]}>
        {overlayCredit ? photo.credit.text : `Photo: ${photo.credit.text} · Cropped ↗`}
      </Text>
    </Pressable>
  ) : null;
  return <View style={[styles.outer, { marginHorizontal: -horizontalInset }, photo && { marginTop: -topInset - 12 }]}
    onLayout={event => measure('root', event.nativeEvent.layout.y)}>
    <View style={photo ? [styles.hero, { minHeight: Math.max(236, topInset + 128), paddingTop: topInset + 24, backgroundColor: colors.anchorSurface }] : styles.plain}>
      {photo ? <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ScenicImage source={{ uri: photo.url }} imageWidth={1200} style={StyleSheet.absoluteFill}
          contentPosition={photo.focus ? { left: photo.focus.split(' ')[0], top: photo.focus.split(' ')[1] } : undefined}
          accessible={false} accessibilityIgnoresInvertColors onError={() => onPhotoError(photo.url)} />
        {/* Blend scenery into the theme beneath the system-managed navigation. */}
        <Shade from={1} to={0} color={colors.bg} height={topInset + 48} />
      </View> : null}
      <View onLayout={event => measure('block', event.nativeEvent.layout.y)}
        style={[styles.titleBlock, photo ? styles.photoTitle : styles.plainTitle,
          overlayCredit && styles.photoTitleWithCredit,
          photo && { backgroundColor: solid ? colors.anchorSurface : `rgba(0,0,0,${RIVER_TITLE_SHADE})` }]}>
        {photo && !solid ? <Shade above from={0} to={RIVER_TITLE_SHADE} height={32} /> : null}
        <Text accessibilityRole="header" onLayout={event => measure('title', event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
          style={[styles.name, { color: ink }]}>{name}</Text>
        <Text style={[styles.meta, { color: photo ? '#FFFFFF' : colors.textMuted }]}>{meta}</Text>
        {/* Kept in flow so large text can grow without overlapping the title. */}
        {overlayCredit ? creditLink : null}
      </View>
    </View>
    {!overlayCredit ? creditLink : null}
  </View>;
}

const styles = StyleSheet.create({
  outer: { marginBottom: 16 },
  hero: { justifyContent: 'flex-end' },
  plain: { paddingTop: 6 },
  titleBlock: { paddingHorizontal: 20 },
  photoTitle: { paddingTop: 8, paddingBottom: 18 },
  photoTitleWithCredit: { paddingBottom: 0 },
  plainTitle: { paddingBottom: 0 },
  name: { ...t['3xl'], fontFamily: fonts.display, flexShrink: 1 },
  meta: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  shade: { position: 'absolute', left: 0, right: 0 },
  credit: { minHeight: 44, paddingHorizontal: 20, paddingVertical: 8, justifyContent: 'center' },
  creditText: { ...t.xs, fontFamily: fonts.body },
  creditOverlay: {
    alignSelf: 'flex-end', maxWidth: '100%', minWidth: 44, minHeight: 44,
    marginRight: -8, // The title is inset 20 pt; the caption sits 12 pt from the edge.
    paddingBottom: 8, justifyContent: 'flex-end',
  },
});
