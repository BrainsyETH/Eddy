// eddy-ios/src/components/PlanItinerary.tsx
// Turning a float into nights.
//
// ── Why the camps come from the server ──────────────────────────────────────
// The map already has a campgrounds layer, so it would be easy to filter that
// by river mile and call it an itinerary. It would also be wrong. "Where can I
// camp on this river" and "where should I stop tonight" are different
// questions: the second one is about SPACING, and /api/plan/campgrounds answers
// it with a database function that walks the segment at floatable intervals.
// Filtering a map layer would happily suggest two camps four hundred yards
// apart.
//
// ── Per-day mileage is the number that decides the trip ─────────────────────
// Nobody plans an overnight by total distance; they plan it by whether day one
// is fourteen miles or twenty-six. So each leg is shown with its own distance
// and its own share of the float time, and the legs are what the section is
// built around rather than the camps themselves.
//
// The per-leg time is the whole-trip estimate apportioned BY DISTANCE. That is
// a real simplification — a slow pool and a fast shoal do not paddle alike —
// and it is stated as "about" everywhere it appears. It is still far better
// than showing one number for three days.
//
// ── The count can disagree, and that is information ─────────────────────────
// Asking for three nights does not mean the stretch has three well-spaced
// camps. When it does not, this says so rather than quietly listing two and
// letting someone discover the gap at dusk.

import { memo, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan, MapAccessPoint } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Day trip through four nights. Past that a float is an expedition, not a plan. */
const NIGHT_OPTIONS = [0, 1, 2, 3, 4];

interface Props {
  plan: FloatPlan;
  nights: number;
  onChangeNights: (nights: number) => void;
  camps: MapAccessPoint[];
  loading: boolean;
}

interface Leg {
  /** Day number, 1-based. */
  day: number;
  from: string;
  to: string;
  miles: number;
  /** Null when the plan has no float time — dangerous water. */
  minutes: number | null;
}

/** Whole hours and minutes, e.g. "4h 20m". Matches the API's own phrasing. */
function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function buildLegs(plan: FloatPlan, camps: MapAccessPoint[]): Leg[] {
  // Ascending river mile is downstream — the direction a float actually goes —
  // and the take-out is guaranteed downstream of the put-in by the planner.
  const stops = [...camps].sort((a, b) => a.riverMile - b.riverMile);
  const points = [
    { name: plan.putIn.name, mile: plan.putIn.riverMile },
    ...stops.map((c) => ({ name: c.name, mile: c.riverMile })),
    { name: plan.takeOut.name, mile: plan.takeOut.riverMile },
  ];

  const totalMiles = plan.distance.miles;
  const totalMinutes = plan.floatTime?.minutes ?? null;

  const legs: Leg[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const miles = Math.abs(points[i + 1].mile - points[i].mile);
    legs.push({
      day: i + 1,
      from: points[i].name,
      to: points[i + 1].name,
      miles,
      minutes:
        totalMinutes != null && totalMiles > 0 ? (totalMinutes * miles) / totalMiles : null,
    });
  }
  return legs;
}

function PlanItineraryComponent({ plan, nights, onChangeNights, camps, loading }: Props) {
  const { colors, elevation } = useTheme();

  // Only as many camps as nights asked for. The endpoint returns every
  // well-spaced camp on the stretch, which for a one-night trip is a menu, not
  // an itinerary.
  const chosen = useMemo(
    () => [...camps].sort((a, b) => a.riverMile - b.riverMile).slice(0, nights),
    [camps, nights],
  );
  const legs = useMemo(() => buildLegs(plan, chosen), [plan, chosen]);
  const short = nights > 0 && !loading && chosen.length < nights;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Nights on the river</Text>

      <View style={styles.options}>
        {NIGHT_OPTIONS.map((option) => {
          const active = option === nights;
          return (
            <Pressable
              key={option}
              onPress={() => onChangeNights(option)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: active ? colors.accent : colors.card,
                  borderColor: active ? colors.accent : colors.border,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option === 0 ? 'Day trip' : `${option} nights`}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: active ? colors.onAccent : colors.textMuted },
                ]}
              >
                {option === 0 ? 'Day trip' : `${option}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {nights === 0 ? (
        <Text style={[styles.note, { color: colors.textSubtle }]}>
          Pick a number of nights and we&apos;ll space camps along the float.
        </Text>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={[styles.note, { color: colors.textSubtle }]}>Finding camps…</Text>
        </View>
      ) : chosen.length === 0 ? (
        <Text style={[styles.note, { color: colors.textMuted }]}>
          No mapped campgrounds are spaced along this stretch. Gravel bars are legal to camp on
          below the high-water mark on most Ozark rivers — but check the landowner rules for this
          one before you count on it.
        </Text>
      ) : (
        <>
          {legs.map((leg) => (
            <View
              key={leg.day}
              style={[styles.leg, { backgroundColor: colors.card }, elevation(1)]}
            >
              <View style={[styles.dayBadge, { backgroundColor: colors.cardRaised }]}>
                <Text style={[styles.dayBadgeText, { color: colors.text }]}>{leg.day}</Text>
              </View>
              <View style={styles.legBody}>
                <Text style={[styles.legRoute, { color: colors.text }]} numberOfLines={2}>
                  {leg.from} → {leg.to}
                </Text>
                <Text style={[styles.legMeta, { color: colors.textMuted }]}>
                  {leg.miles.toFixed(1)} mi
                  {leg.minutes != null ? ` · about ${formatMinutes(leg.minutes)} on the water` : ''}
                </Text>
              </View>
              {/* The last leg ends at the take-out, not at a camp. */}
              <Ionicons
                name={leg.day === legs.length ? 'flag-outline' : 'bonfire-outline'}
                size={16}
                color={leg.day === legs.length ? colors.accent : colors.success}
              />
            </View>
          ))}

          {short ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              Only {chosen.length} well-spaced {chosen.length === 1 ? 'camp' : 'camps'} on this
              stretch, so this is {chosen.length} {chosen.length === 1 ? 'night' : 'nights'} rather
              than {nights}. Try a longer float or a different pair of access points.
            </Text>
          ) : null}

          <Text style={[styles.note, { color: colors.textSubtle }]}>
            Daily times are the trip estimate split by distance — a slow pool and a fast shoal do
            not paddle alike. Book ahead where a camp takes reservations.
          </Text>
        </>
      )}
    </View>
  );
}

export const PlanItinerary = memo(PlanItineraryComponent);

const styles = StyleSheet.create({
  section: { marginTop: 8, marginBottom: 10 },
  sectionTitle: { ...t.base, fontFamily: fonts.heading, marginBottom: 10, paddingHorizontal: 2 },
  options: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  option: {
    minWidth: 44,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  optionText: { ...t.xs, fontFamily: fonts.semibold },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 12, marginBottom: 8 },
  dayBadge: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dayBadgeText: { ...t.xs, fontFamily: fonts.semibold },
  legBody: { flex: 1, minWidth: 0 },
  legRoute: { ...t.sm, fontFamily: fonts.semibold },
  legMeta: { ...t.xs, fontFamily: fonts.mono, marginTop: 2 },
  note: { ...t.xs, fontFamily: fonts.body, marginTop: 4, paddingHorizontal: 2 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
});
