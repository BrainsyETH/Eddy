import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { accessTypeLabel } from '@eddy/types';
import { ScenicImage } from './ScenicImage';
import { EddySymbol } from './EddySymbol';
import { accessTypeSymbol } from './map-sheet/placeSymbol';
import { agencyLabel } from '@/lib/accessCopy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Shared by cached and loaded pages so the header does not change shape on load. */
export function AccessPagePhotos({ imageUrls, name }: { imageUrls?: readonly string[] | null; name: string }) {
  const viewport = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const urls = [...new Set(imageUrls ?? [])].filter(url => url && !failedUrls.includes(url));
  const width = measuredWidth ?? viewport.width;
  if (!urls.length) return null;
  return <View onLayout={event => {
    if (event.nativeEvent.layout.width > 0) setMeasuredWidth(event.nativeEvent.layout.width);
  }}>
    <PhotoPages key={`${width}:${urls.join('|')}`} urls={urls} name={name} width={width}
      onFailed={url => setFailedUrls(previous => previous.includes(url) ? previous : [...previous, url])} />
  </View>;
}

/** Reset the page position when the viewport or available photos change. */
function PhotoPages({ urls, name, width, onFailed }: {
  urls: string[]; name: string; width: number; onFailed: (url: string) => void;
}) {
  const { colors } = useTheme();
  const [page, setPage] = useState(0);
  const height = Math.min(320, width * 9 / 16);
  return <View>
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={100}
      onScroll={event => setPage(Math.max(0, Math.min(urls.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))}>
      {urls.map((url, index) => <ScenicImage key={url} source={{ uri: url }} imageWidth={1200}
        style={{ width, height, backgroundColor: colors.cardRaised }}
        accessibilityLabel={`${name}, photo ${index + 1} of ${urls.length}`}
        accessibilityIgnoresInvertColors onError={() => onFailed(url)} />)}
    </ScrollView>
    {urls.length > 1 ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.photoCount, { backgroundColor: colors.anchorSurface }]}>
      <Text style={[styles.photoCountText, { color: colors.onAnchor }]}>{page + 1} / {urls.length}</Text>
    </View> : null}
  </View>;
}

export function AccessPageFacts({ types, riverMile, isPublic, feeRequired, managingAgency }: {
  types: readonly string[];
  riverMile?: number | null;
  isPublic?: boolean;
  feeRequired?: boolean;
  managingAgency?: string | null;
}) {
  const { colors } = useTheme();
  const facts = [
    { key: 'mile', label: riverMile != null ? `Mile ${riverMile}` : null, symbol: null },
    ...[...new Set(types)].filter(type => type !== 'access').map(type => ({
      key: `type:${type}`, label: accessTypeLabel(type), symbol: accessTypeSymbol(type),
    })),
    { key: 'public', label: isPublic === undefined ? null : isPublic ? 'Public' : 'Private', symbol: null },
    { key: 'fee', label: feeRequired ? 'Fee required' : null, symbol: null },
    { key: 'agency', label: managingAgency ? agencyLabel(managingAgency) : null, symbol: null },
  ].filter(fact => fact.label);
  if (!facts.length) return null;
  return <View style={styles.facts}>
    {facts.map(fact => <View key={fact.key} style={[styles.fact, { backgroundColor: colors.cardRaised }]}>
      {fact.symbol ? <EddySymbol name={fact.symbol} size={16} /> : null}
      <Text style={[styles.factText, { color: colors.textMuted }]}>{fact.label}</Text>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  photoCount: { position: 'absolute', bottom: 12, right: 16, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  photoCountText: { ...t.xs, fontFamily: fonts.medium },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, marginTop: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  factText: { ...t.xs, fontFamily: fonts.medium, flexShrink: 1 },
});
