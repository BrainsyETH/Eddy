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
// Reuse the active planner’s access points. Shared plans load cached places
// immediately and refresh independently of the rest of the plan.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FloatPlan, MapAccessPoint } from '@eddy/types';
import { accessTypeLabel } from '@eddy/types';
import { fetchRiverAccessPoints } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { PlanAccessPhoto } from '@/components/PlanAccessPhoto';
import { readRiver } from '@/lib/riverCache';
import { alongRoutePoints, loadPlanAccess } from '@/lib/loadPlanAccess';
import { ControlIcon } from '@/components/ControlIcon';
import { planAccessDestination, type PlanDetailDestination } from '@/lib/planDestinations';

export function PlanAlongRoute({ plan, accessPoints, onOpenDetail }: {
  plan: FloatPlan;
  accessPoints?: MapAccessPoint[];
  onOpenDetail: (destination: PlanDetailDestination) => void;
}) {
  const { colors, elevation } = useTheme();
  const [loaded, setLoaded] = useState<MapAccessPoint[]>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  // Six rows answer most floats; a long one shows the rest on request rather
  // than silently dropping the bail-outs nearest the take-out.
  const [expanded, setExpanded] = useState(false);
  const slug = plan.river.slug;

  useEffect(() => {
    // Includes a known-empty list: the active planner already fetched this river.
    if (accessPoints !== undefined || !slug) return;
    const controller = new AbortController();
    void loadPlanAccess({
      cached: async () => (await readRiver(slug))?.payload.accessPoints,
      fresh: () => fetchRiverAccessPoints(slug, controller.signal),
      publish: setLoaded,
      unavailable: () => setFailed(true),
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [slug, accessPoints, retry]);

  const points = accessPoints ?? loaded;
  const { all, shown, hidden } = useMemo(
    () => alongRoutePoints(points, plan.putIn.riverMile, plan.takeOut.riverMile, expanded),
    [points, plan.putIn.riverMile, plan.takeOut.riverMile, expanded],
  );

  if (points === undefined) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Along the way</Text>
        {failed ? (
          <Pressable
            onPress={() => { setFailed(false); setRetry((value) => value + 1); }}
            style={styles.retry}
            accessibilityRole="button"
          >
            <Text style={[styles.meta, { color: colors.interactive }]}>
              Could not load places along your route. Tap to retry.
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.meta, { color: colors.textMuted }]}>Loading places along your route…</Text>
        )}
      </View>
    );
  }
  if (all.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Along the way ({all.length})
      </Text>

      {shown.map((point) => {
        const into = point.riverMile - plan.putIn.riverMile;
        const destination = planAccessDestination(slug, point);
        return (
          <Pressable
            key={point.id}
            disabled={!destination}
            onPress={destination ? () => onOpenDetail(destination) : undefined}
            style={({ pressed }) => [styles.row, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }, elevation(1)]}
            accessibilityRole={destination ? 'button' : undefined}
            accessibilityLabel={`${point.name}, ${into.toFixed(1)} miles from put-in, ${accessTypeLabel(point.type)}${point.isPublic ? '' : ', Private'}`}
            accessibilityHint={destination ? 'Opens place details' : undefined}
          >
            <PlanAccessPhoto point={point} style={styles.photo} />
            <View style={styles.body}>
              <Text style={[styles.name, { color: colors.text }]}>
                {point.name}
              </Text>
              <Text style={[styles.mile, { color: colors.textMuted }]}>
                {into.toFixed(1)} mi from put-in
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
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
            {destination ? <ControlIcon name="chevron-forward" size={17} color={colors.textSubtle} /> : null}
          </Pressable>
        );
      })}

      {hidden > 0 ? (
        <Pressable
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [styles.more, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Show all ${all.length} places along the way`}
        >
          <Text style={[styles.moreText, { color: colors.interactive }]}>Show all {all.length}</Text>
          <ControlIcon name="chevron-down" size={15} color={colors.interactive} />
        </Pressable>
      ) : null}
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
  photo: { width: 96, aspectRatio: 4 / 3, borderRadius: 8 },
  mile: { ...t.xs, fontFamily: fonts.mono, marginTop: 4 },
  retry: { minHeight: 44, justifyContent: 'center' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  moreText: { ...t.sm, fontFamily: fonts.semibold },
  body: { flex: 1, minWidth: 0 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
});
