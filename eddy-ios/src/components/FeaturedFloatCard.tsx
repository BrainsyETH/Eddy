// The Featured Float card: one of Eddy's curated guide picks, with a single
// action that opens it in the planner. Lives on the Floats tab; the full
// curated list is /favorite-floats.

import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FavoriteFloatSummary } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { EddyScene } from '@/components/EddyScene';
import { favoriteFloatMeta } from '@/lib/favoriteFloatCopy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function FeaturedFloatCard({
  item,
  onPlan,
}: {
  item: FavoriteFloatSummary;
  onPlan: () => void;
}) {
  const { colors, elevation } = useTheme();
  return (
    <View style={[styles.floatPreview, { backgroundColor: colors.card }, elevation(1)]}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.floatPreviewPhoto} />
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
        <Text style={[styles.floatPreviewTitle, { color: colors.text }]} numberOfLines={2}>{item.tagline}</Text>
        <Text style={[styles.floatEndpoints, { color: colors.textMuted }]} numberOfLines={2}>{item.putInName} → {item.takeOutName}</Text>
        <Text style={[styles.floatMeta, { color: colors.textMuted }]} numberOfLines={2}>{favoriteFloatMeta(item)}</Text>
        <Pressable
          onPress={onPlan}
          style={({ pressed }) => [styles.floatPlan, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
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
  routeLine: { position: 'absolute', left: 35, top: 43, width: 77, height: 50, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 22, transform: [{ rotate: '-10deg' }] },
  floatEddy: { position: 'absolute', right: 8, bottom: -9 },
  floatPreviewBody: { padding: 14 },
  floatRiver: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8 },
  floatPreviewTitle: { ...t.lg, fontFamily: fonts.heading, marginTop: 3 },
  floatEndpoints: { ...t.sm, fontFamily: fonts.body, marginTop: 5 },
  floatMeta: { ...t.xs, fontFamily: fonts.mono, marginTop: 7 },
  floatPlan: { minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 },
  floatPlanText: { ...t.sm, fontFamily: fonts.semibold },
});
