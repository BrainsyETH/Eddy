// The Featured Float card: one of Eddy's curated guide picks, with a single
// action that opens it in the planner. Lives on the Floats tab; the full
// curated list is /favorite-floats.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FavoriteFloatSummary } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { EddyScene } from '@/components/EddyScene';
import { compactFloatTime } from '@/lib/favoriteFloatCopy';
import { ScenicImage } from './ScenicImage';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function FeaturedFloatCard({
  item,
  onPlan,
  riverPhotoUrl,
  detailed = false,
}: {
  item: FavoriteFloatSummary;
  onPlan: () => void;
  riverPhotoUrl?: string;
  detailed?: boolean;
}) {
  const { colors, elevation } = useTheme();
  const [failedUris, setFailedUris] = useState<string[]>([]);
  const photo = [item.photoUrl, riverPhotoUrl].find(
    (url): url is string => !!url && !failedUris.includes(url),
  );
  return (
    <View style={[styles.floatPreview, { backgroundColor: colors.card }, elevation(1)]}>
      {photo ? (
        <ScenicImage
          source={{ uri: photo }}
          style={styles.floatPreviewPhoto}
          accessible={false}
          onError={() => setFailedUris((uris) => [...uris, photo])}
        />
      ) : (
        <View style={[styles.floatFallback, { backgroundColor: colors.selectionBg }]}>
          <View style={[styles.routeDot, styles.routeDotStart, { backgroundColor: colors.accent }]} />
          <View style={[styles.routeLine, { borderColor: colors.interactive }]} />
          <View style={[styles.routeDot, styles.routeDotEnd, { backgroundColor: colors.interactive }]} />
          <EddyScene name="routePlanning" size={104} style={styles.floatEddy} />
        </View>
      )}
      <View style={styles.floatPreviewBody}>
        <Text style={[styles.floatRiver, { color: colors.accent }]}>{item.riverName.toUpperCase()}</Text>
        <Text style={[styles.floatPreviewTitle, { color: colors.text }]} numberOfLines={2}>
          {item.tagline}
        </Text>
        <Text style={[styles.floatEndpoints, { color: colors.textMuted }]} numberOfLines={2}>
          {item.putInName} → {item.takeOutName}
        </Text>
        <Text style={[styles.floatMeta, { color: colors.text }]}>
          {item.distanceMiles.toFixed(1)} mi
          {item.durationFormatted ? ` · About ${compactFloatTime(item.durationFormatted)}` : ''}
        </Text>
        <Text style={[styles.floatNote, { color: colors.textMuted }]}>
          {item.durationFormatted
            ? 'Typical canoe trip'
            : item.durationUnavailableReason === 'regulated'
              ? 'Time varies with dam releases'
              : 'Open plan for float time'}
          {item.difficulty ? ` · Class ${item.difficulty}` : ''}
        </Text>
        {detailed && item.bestFor ? <Text style={[styles.floatNote, { color: colors.textMuted }]}>Best for {item.bestFor}</Text> : null}
        <Pressable
          onPress={onPlan}
          style={({ pressed }) => [
            styles.floatPlan,
            {
              backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Plan ${item.putInName} to ${item.takeOutName}`}
        >
          <ControlIcon name="map-outline" size={17} color={colors.onAccent} />
          <Text style={[styles.floatPlanText, { color: colors.onAccent }]}>Plan this float</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatPreview: { width: '100%', borderRadius: 18, overflow: 'hidden' },
  floatPreviewPhoto: { width: '100%', height: 126 },
  floatFallback: { width: '100%', height: 126, overflow: 'hidden' },
  routeDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, zIndex: 2 },
  routeDotStart: { left: 26, top: 35 },
  routeDotEnd: { left: 104, top: 87 },
  routeLine: {
    position: 'absolute',
    left: 35,
    top: 43,
    width: 77,
    height: 50,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderBottomLeftRadius: 22,
    transform: [{ rotate: '-10deg' }],
  },
  floatEddy: { position: 'absolute', right: 8, bottom: -9 },
  floatPreviewBody: { padding: 14 },
  floatRiver: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8 },
  floatPreviewTitle: { ...t.lg, fontFamily: fonts.heading, marginTop: 3 },
  floatEndpoints: { ...t.sm, fontFamily: fonts.body, marginTop: 5 },
  floatMeta: { ...t.sm, fontFamily: fonts.semibold, marginTop: 9 },
  floatNote: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  floatPlan: {
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
  },
  floatPlanText: { ...t.sm, fontFamily: fonts.semibold },
});
