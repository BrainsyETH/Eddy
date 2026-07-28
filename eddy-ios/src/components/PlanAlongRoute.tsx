// eddy-ios/src/components/PlanAlongRoute.tsx
// What you pass between the two ends.
//
// The website's plan page carries an "Along Your Route" list and it earns its
// place for a reason the map cannot: an access point between your put-in and
// your take-out is a BAIL-OUT. Weather turns, somebody's shoulder gives up, a
// kid has had enough — the useful question becomes "where is the next place a
// car can reach me", and the answer needs to be a list with mileage on it, not a
// pin you have to find by panning.
//
// ── Mileage from the put-in, not the headwaters ─────────────────────────────
// river_mile_downstream counts from the top of the river, which is the right
// number for a database and the wrong one for a paddler mid-float. Each row
// leads with how far INTO this float the point is, because that is the number
// that answers "can we make it".
//
// Fetched here for the same reason as PlanNearby: this has to work on the screen
// that opens a shared float, which holds a plan and nothing else.

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan, MapAccessPoint } from '@eddy/types';
import { accessTypeLabel, isCampground } from '@eddy/types';
import { fetchRiverAccessPoints } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddySymbol } from '@/components/EddySymbol';

/** Enough to plan a bail-out; past this it is a list of the whole river. */
const MAX_SHOWN = 6;

export function PlanAlongRoute({ plan }: { plan: FloatPlan }) {
  const { colors, elevation } = useTheme();
  const [points, setPoints] = useState<MapAccessPoint[]>([]);

  const slug = plan.river.slug;

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetchRiverAccessPoints(slug, controller.signal)
      .then(setPoints)
      .catch(() => setPoints([]));
    return () => controller.abort();
  }, [slug]);

  const between = useMemo(() => {
    const start = plan.putIn.riverMile;
    const end = plan.takeOut.riverMile;
    return points
      .filter((p) => p.riverMile > start && p.riverMile < end)
      .sort((a, b) => a.riverMile - b.riverMile)
      .slice(0, MAX_SHOWN);
  }, [points, plan.putIn.riverMile, plan.takeOut.riverMile]);

  if (between.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Along the way ({between.length})
      </Text>

      {between.map((point) => {
        const into = point.riverMile - plan.putIn.riverMile;
        return (
          <View
            key={point.id}
            style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}
          >
            <Text style={[styles.mile, { color: colors.textMuted }]}>{into.toFixed(1)}</Text>
            <View style={styles.body}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {point.name}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                {[
                  accessTypeLabel(point.type),
                  // "Private" is the difference between a bail-out and a
                  // trespass, so it is never abbreviated away.
                  point.isPublic ? null : 'Private',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {isCampground(point) ? (
              <EddySymbol name="campground" size={17} />
            ) : (
              <Ionicons
                name={point.isPublic ? 'location-outline' : 'lock-closed-outline'}
                size={15}
                color={point.isPublic ? colors.accent : colors.textSubtle}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8, marginBottom: 10 },
  sectionTitle: { ...t.base, fontFamily: fonts.heading, marginBottom: 8, paddingHorizontal: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  // Mono and fixed-width so the mileage column reads as a column.
  mile: { ...t.sm, fontFamily: fonts.mono, width: 34, textAlign: 'right' },
  body: { flex: 1, minWidth: 0 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
});
