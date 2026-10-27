import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { floatRangeLabel, publicAccessLabel, type FloatSearchOption } from '@eddy/conditions/float-search';
import { ScenicImage } from './ScenicImage';
import { EddyScene } from './EddyScene';
import { ControlIcon } from './ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { conditionBg, conditionText } from '@/theme/conditions';
import { fonts, type as t } from '@/theme/typography';

/** A route to compare at a glance; supporting copy stays one tap away. */
export function FloatSearchCard({
  option: route,
  riverPhotoUrl,
  onPlan,
  onTimeInfo,
}: {
  option: FloatSearchOption;
  riverPhotoUrl?: string;
  onPlan: () => void;
  onTimeInfo: () => void;
}) {
  const { colors, isDark, elevation } = useTheme();
  const stacked = useWindowDimensions().fontScale > 1.3;
  const [expanded, setExpanded] = useState(false);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const photo = [route.photo?.url, riverPhotoUrl].find(
    (uri): uri is string => !!uri && !failedPhotos.includes(uri),
  );
  const code = route.conditionCode ?? 'unknown';
  const publicEndpoints = route.putIn.isPublic === true && route.takeOut.isPublic === true;
  const privateEndpoint = route.putIn.isPublic === false || route.takeOut.isPublic === false;
  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      {photo ? (
        <ScenicImage
          source={{ uri: photo }}
          style={styles.photo}
          accessible={false}
          onError={() => setFailedPhotos((previous) => [...previous, photo])}
        />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: colors.selectionBg }]}>
          <EddyScene name="routePlanning" size={120} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={[t.sm, styles.bold, { color: colors.interactive }]}>{route.riverName}</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {route.putIn.name} → {route.takeOut.name}
        </Text>
        <View style={[styles.metrics, stacked && styles.stackedMetrics]}>
          <Pressable
            accessibilityRole="button"
            onPress={onTimeInfo}
            style={styles.metric}
            accessibilityLabel={`${floatRangeLabel(route.timeRange)} estimated time. About float times`}
          >
            <Text style={[styles.value, { color: colors.text }]}>
              {floatRangeLabel(route.timeRange).replace(' hours', ' hr')}
            </Text>
            <View style={styles.inline}>
              <Text style={[t.xs, { color: colors.textMuted }]}>
                {route.estimateBasis === 'typical' ? 'Typical estimate' : 'Estimated time'}
              </Text>
              <ControlIcon name="information-circle-outline" size={14} color={colors.interactive} />
            </View>
          </Pressable>
          <View
            style={[
              styles.metric,
              stacked ? styles.stackedDistance : styles.distance,
              { borderColor: colors.border },
            ]}
          >
            <Text style={[styles.value, { color: colors.text }]}>{route.distanceMiles.toFixed(1)} mi</Text>
            <Text style={[t.xs, { color: colors.textMuted }]}>On the river</Text>
          </View>
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: conditionBg(code, isDark) }]}>
            <Text style={[t.sm, styles.bold, { color: conditionText(code, isDark) }]}>
              {route.conditionLabel}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.cardRaised }]}>
            <Text style={[t.sm, { color: colors.textMuted }]}>
              {publicEndpoints
                ? 'Public access'
                : privateEndpoint
                  ? 'Includes private access'
                  : 'Access unconfirmed'}
            </Text>
          </View>
          {route.relation !== 'match' ? (
            <Text style={[t.sm, { color: colors.textMuted }]}>
              {route.relation === 'shorter' ? 'Shorter option' : 'Longer option'}
            </Text>
          ) : null}
        </View>
        {route.conditional && !route.cautions.length ? (
          <Text style={[t.sm, { color: colors.text }]}>Check route cautions before going.</Text>
        ) : null}
        {route.cautions.map((caution, index) => (
          <Text key={index} style={[t.sm, { color: colors.text }]}>
            {caution}
          </Text>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${expanded ? 'Hide' : 'Show'} route details for ${route.putIn.name} to ${route.takeOut.name}`}
          onPress={() => setExpanded((value) => !value)}
          style={styles.detailsButton}
        >
          <Text style={[t.sm, { color: colors.interactive }]}>Route details</Text>
          <ControlIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.interactive} />
        </Pressable>
        {expanded ? (
          <View style={styles.details}>
            <Text style={[t.sm, { color: colors.textMuted }]}>
              Put-in: {publicAccessLabel(route.putIn.isPublic)}
              {'\n'}Take-out: {publicAccessLabel(route.takeOut.isPublic)}
            </Text>
            <Text style={[t.sm, { color: colors.textMuted }]}>
              {route.estimateBasis === 'current_conditions'
                ? 'Estimate uses current conditions.'
                : 'Estimate uses typical conditions.'}
              {route.observedAt && route.estimateBasis === 'current_conditions'
                ? ` Reading ${new Date(route.observedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
                : ''}
            </Text>
            {route.description ? (
              <Text style={[t.sm, { color: colors.textMuted }]}>{route.description}</Text>
            ) : null}
            {route.photo?.caption && photo === route.photo.url ? (
              <Text style={[t.xs, { color: colors.textMuted }]}>{route.photo.caption}</Text>
            ) : null}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onPlan}
          accessibilityLabel={`Open plan from ${route.putIn.name} to ${route.takeOut.name}`}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill },
          ]}
        >
          <Text style={[t.base, styles.bold, { color: colors.onAccent, flexShrink: 1 }]}>
            View float plan
          </Text>
          <ControlIcon name="arrow-forward" size={18} color={colors.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden' },
  photo: { width: '100%', height: 140 },
  placeholder: { height: 140, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12 },
  bold: { fontFamily: fonts.semibold },
  title: { ...t.lg, fontFamily: fonts.heading },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, paddingVertical: 4 },
  stackedMetrics: { flexDirection: 'column' },
  metric: { flex: 1, minWidth: 120, minHeight: 48, gap: 4, justifyContent: 'center' },
  distance: { borderLeftWidth: 1, paddingLeft: 16 },
  stackedDistance: { borderTopWidth: 1, paddingTop: 12 },
  value: { ...t.xl, fontFamily: fonts.heading },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  detailsButton: {
    flexDirection: 'row',
    minHeight: 44,
    gap: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  details: { gap: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 48,
    padding: 12,
    borderRadius: 12,
  },
});
