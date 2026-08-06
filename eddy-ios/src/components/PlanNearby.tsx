// eddy-ios/src/components/PlanNearby.tsx
// Who can shuttle you, ordered by how close they are to your put-in.
//
// Ported in spirit from the website's OutfittersNearby, which calls this the
// conversion moment and is right about it: the instant a paddler has two ends of
// a float, the next thing they need is somebody with a van. It belongs in the
// plan rather than only on the map layer, because a pin you have to hunt for is
// not an answer to "who runs the shuttle here".
//
// ── Phone first ─────────────────────────────────────────────────────────────
// Same rule the map callout follows: at a put-in on one bar, a number you can
// tap beats a website you have to load. A row with neither gets no buttons
// rather than a button that does nothing.
//
// ── Fetched here, not passed in ─────────────────────────────────────────────
// This component asks for the river's services itself so it works identically in
// the planning sheet and on the screen that opens a shared float — the second of
// which has a plan and no other river data at all. It is one small cached call
// per river, and a failure is silence: a plan with no outfitter list is still a
// plan.

import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan, RiverService } from '@eddy/types';
import { serviceEligible, serviceOffers } from '@eddy/types';
import { fetchRiverServices } from '@/api/client';
import { serviceTypeLabel } from '@/map/serviceLayers';
import { mappableService } from '@/map/mappable';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { milesBetween } from '@/hooks/useLocation';
import { EddySymbol } from '@/components/EddySymbol';

/** Three is a shortlist. More than that is a directory, and this is not one. */
const MAX_SHOWN = 3;

function websiteUrl(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export function PlanNearby({ plan }: { plan: FloatPlan }) {
  const { colors, elevation } = useTheme();
  const [services, setServices] = useState<RiverService[]>([]);

  const slug = plan.river.slug;

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetchRiverServices(slug, controller.signal)
      .then(setServices)
      .catch(() => setServices([]));
    return () => controller.abort();
  }, [slug]);

  const nearest = useMemo(() => {
    const putIn = plan.putIn.coordinates;
    return services
      .filter(
        (s) =>
          // ── ASKS WHETHER IT SHUTTLES, NOT WHAT IT IS CALLED ─────────────
          //
          // The capability, NOT the tier. `serviceTiers(...).includes('rentals')`
          // looks like this question and is not it: the tier unions in the kind
          // as a floor, so every `outfitter` qualifies whether or not it records
          // a shuttle. That is right for a map layer and wrong for a heading
          // that names one service — it recommended all 71 outfitters, three of
          // which shuttle nobody.
          //
          // It also brings this level with the website, which has asked the
          // capability all along (ShuttlePanel) — so the two platforms stop
          // disagreeing about what a shuttle is. The 10 campgrounds and lodges
          // that DO run shuttles now qualify, which the old type-based list
          // could never express.
          serviceOffers(s, 'shuttle') &&
          // Still trading. A closed business is the one recommendation that is
          // worse than none, and this is a recommendation with a mileage on it.
          serviceEligible(s) &&
          // The distance below is only as good as the coordinate it is measured
          // from — a town centroid would put "4.2 mi away" against a point the
          // map itself refuses to draw.
          mappableService(s) &&
          s.latitude != null &&
          s.longitude != null &&
          // A row with no way to reach it is a name, not a contact. Stays local
          // to this surface: a recommendation needs to be actionable, a map pin
          // does not.
          (s.phone || s.website),
      )
      .map((s) => ({
        service: s,
        miles: milesBetween(putIn, { lng: s.longitude as number, lat: s.latitude as number }),
      }))
      .sort((a, b) => a.miles - b.miles)
      .slice(0, MAX_SHOWN);
  }, [services, plan.putIn.coordinates]);

  if (nearest.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Shuttles near the put-in</Text>

      {nearest.map(({ service, miles }) => (
        <View
          key={service.id}
          style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}
        >
          <View style={[styles.iconWell, { backgroundColor: colors.cardRaised }]}>
            <EddySymbol name="outfitter" size={17} />
          </View>

          <View style={styles.body}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {service.name}
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
              {[
                serviceTypeLabel(service),
                // Straight-line, and said so: an outfitter four miles off can be
                // twenty minutes of gravel.
                `${miles < 10 ? miles.toFixed(1) : miles.toFixed(0)} mi away`,
              ].join(' · ')}
            </Text>
          </View>

          <View style={styles.actions}>
            {service.phone ? (
              <Pressable
                onPress={() =>
                  void Linking.openURL(`tel:${service.phone!.replace(/[^\d+]/g, '')}`)
                }
                style={({ pressed }) => [
                  styles.action,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Call ${service.name}`}
              >
                <Ionicons name="call-outline" size={15} color={colors.interactive} />
              </Pressable>
            ) : null}
            {service.website ? (
              <Pressable
                onPress={() => void Linking.openURL(websiteUrl(service.website!))}
                style={({ pressed }) => [
                  styles.action,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${service.name} website`}
              >
                <Ionicons name="globe-outline" size={15} color={colors.interactive} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
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
  iconWell: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 7 },
  action: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
