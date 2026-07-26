// eddy-ios/app/river/[slug].tsx
// One river: what it's doing right now, what could hurt you, and where to get on.
//
// This is the screen the whole app was missing. River Reports listed rivers and
// tapping one went nowhere; the alert engine had no button; hazards existed in
// the database and appeared on no surface at all.
//
// Free/paid boundary, enforced by what this screen renders rather than by a
// check anywhere in it:
//   FREE  condition, reading, percentile context, hazards, access points
//   PAID  being told about a change before you look
// Nothing on this screen is gated. The bell is the only paid affordance, and it
// only gates the NOTIFICATION, never the information.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type {
  Hazard,
  MapAccessPoint,
  RiverConditionDetail,
  RiverListItem,
  RiverOutlookResponse,
} from '@eddy/types';
import {
  criticalHazards,
  hazardConditionCode,
  hazardTypeLabel,
  portageNote,
  severityLabel,
  sortHazards,
} from '@eddy/hazards';
import {
  ApiError,
  fetchCondition,
  fetchHazards,
  fetchRiverAccessPoints,
  fetchRiverOutlook,
  fetchRivers,
  subscribeToRiver,
} from '@/api/client';
import {
  conditionBg,
  conditionChipBorder,
  conditionColor,
  conditionInk,
  conditionLongLabel,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  accuracyNote,
  formatReading,
  percentileLabel,
  percentileSentence,
  primaryReading,
  readingAge,
} from '@/lib/readingCopy';
import { EddyTake } from '@/components/EddyTake';
import { Otter, otterForCondition } from '@/components/Otter';
import { PaywallSheet } from '@/components/PaywallSheet';
import { PushPrimer } from '@/components/PushPrimer';
import { usePush } from '@/hooks/usePush';
import { useSession } from '@/hooks/useSession';
import { useStarredRivers } from '@/hooks/useStarredRivers';

export default function RiverDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { getAccessToken } = useSession();
  const { isStarred, toggleStar } = useStarredRivers();

  const [river, setRiver] = useState<RiverListItem | null>(null);
  const [condition, setCondition] = useState<RiverConditionDetail | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [accessPoints, setAccessPoints] = useState<MapAccessPoint[]>([]);
  const [outlook, setOutlook] = useState<RiverOutlookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);
  const { permission, enable } = usePush();
  const [subscribing, setSubscribing] = useState(false);
  const [showAllHazards, setShowAllHazards] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setLoading(true);

    (async () => {
      try {
        // The rivers list is the only place carrying the river's id and current
        // condition code together, and it is CDN-cached, so this is cheap.
        const rivers = await fetchRivers(controller.signal);
        const match = rivers.find((r) => r.slug === slug) ?? null;
        if (!match) {
          setError('River not found');
          return;
        }
        setRiver(match);

        // Each of these degrades on its own. A river with no gauge, no recorded
        // hazards or no access points is an ordinary state, and one failing must
        // not blank the other two.
        const [cond, haz, access, look] = await Promise.all([
          fetchCondition(match.id, controller.signal).catch(() => null),
          fetchHazards(slug, controller.signal).catch(() => [] as Hazard[]),
          fetchRiverAccessPoints(slug, controller.signal).catch(() => [] as MapAccessPoint[]),
          // The outlook reaches three third-party services behind one request.
          // Any of them being down is an ordinary day, and the screen's core job
          // — condition, reading, hazards — must not depend on the forecast.
          fetchRiverOutlook(slug, controller.signal).catch(() => null),
        ]);
        setCondition(cond);
        setHazards(haz);
        setAccessPoints(access);
        setOutlook(look);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(err instanceof ApiError ? err.message : 'Could not load this river');
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [slug]);

  /**
   * Create the alert subscription.
   *
   * `offerOnFailure` controls what happens when the server says no. On the
   * user's own tap that means showing the paywall — the 402 IS the trigger.
   * Straight after a purchase it must not: they have just paid, and bouncing
   * them back into the wall they only escaped a second ago is the worst
   * possible moment to ask again. If it fails there the button simply stays as
   * it was, and their next tap tries again.
   */
  const subscribe = useCallback(
    async ({ offerOnFailure }: { offerOnFailure: boolean }) => {
      if (!river) return;
      setSubscribing(true);
      try {
        const token = await getAccessToken();
        if (!token) {
          // No session — anonymous sign-in is off or unreachable. Show the offer
          // rather than an error: the user asked for something we cannot deliver
          // yet, and the reason is ours, not theirs.
          if (offerOnFailure) setPaywallOpen(true);
          return;
        }
        const result = await subscribeToRiver(token, river.id, 'floatable');
        if (result.paymentRequired) {
          if (offerOnFailure) setPaywallOpen(true);
          return;
        }

        // The subscription exists — now, and only now, is it worth spending
        // the one-shot iOS permission prompt: there is a concrete notification
        // waiting to be delivered, which is the strongest case this app will
        // ever have. Asking earlier would burn it on a hypothetical.
        if (permission === 'undetermined') setPrimerOpen(true);
      } catch {
        if (offerOnFailure) setPaywallOpen(true);
      } finally {
        setSubscribing(false);
      }
    },
    [river, getAccessToken, permission],
  );

  const onNotify = useCallback(() => subscribe({ offerOnFailure: true }), [subscribe]);

  // Fired once the entitlement is live on the server. Finishes what the user
  // originally tapped: they wanted to be told about THIS river, and the
  // purchase was only the obstacle in the way of that.
  const onPurchased = useCallback(() => {
    void subscribe({ offerOnFailure: false });
  }, [subscribe]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (error || !river) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]}>
        <Otter mood="flag" size={110} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>{error ?? 'River not found'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.backLink, { color: colors.accent }]}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const code = condition?.code ?? river.currentCondition?.code ?? 'unknown';
  const reading = condition ? primaryReading(condition) : null;
  const caveat = condition ? accuracyNote(condition) : null;
  const percentileText = percentileSentence(condition?.percentile);
  const starred = isStarred(river.id);
  const sortedHazards = sortHazards(hazards);
  const shownHazards = showAllHazards ? sortedHazards : criticalHazards(hazards);
  const hiddenCount = sortedHazards.length - shownHazards.length;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => toggleStar({ riverId: river.id, name: river.name, slug: river.slug })}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={starred ? `Unstar ${river.name}` : `Star ${river.name}`}
        >
          <Ionicons
            name={starred ? 'star' : 'star-outline'}
            size={24}
            color={starred ? colors.warm : colors.textSubtle}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.riverName, { color: colors.text }]}>{river.name}</Text>
        <Text style={[styles.riverMeta, { color: colors.textMuted }]}>
          {river.region ?? river.state}
          {river.lengthMiles ? ` · ${Math.round(river.lengthMiles)} river miles` : ''}
        </Text>

        {/* ── Live status ─────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
          <View style={styles.statusHead}>
            <Otter mood={otterForCondition(code)} size={64} />
            <View style={styles.statusHeadText}>
              <View
                style={[
                  styles.conditionChip,
                  { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) },
                ]}
              >
                <Text style={[styles.conditionChipText, { color: conditionInk(code) }]}>
                  {conditionLongLabel(code)}
                </Text>
              </View>
              {reading ? (
                // Geist Mono, not the body face. Proportional digits change
                // width as the number ticks, so a reading going 1.51 -> 1.62
                // would shift this whole row.
                <Text style={[styles.reading, { color: colors.text }]}>
                  {formatReading(reading.value, reading.unit)}
                </Text>
              ) : (
                <Text style={[styles.noReading, { color: colors.textMuted }]}>
                  No gauge reading available
                </Text>
              )}
            </View>
          </View>

          {percentileText ? (
            <View style={[styles.percentileRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.percentileText, { color: colors.text }]}>{percentileText}</Text>
              <Text style={[styles.percentileMeta, { color: colors.textSubtle }]}>
                {percentileLabel(condition?.percentile)}
              </Text>
            </View>
          ) : null}

          {condition?.readingAgeHours != null ? (
            <Text style={[styles.updated, { color: colors.textSubtle }]}>
              {readingAge(condition.readingAgeHours)}
              {condition.gaugeName ? ` · ${condition.gaugeName}` : ''}
            </Text>
          ) : null}

          {caveat ? (
            <View style={[styles.caveat, { backgroundColor: conditionBg('unknown') }]}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.caveatText, { color: colors.textMuted }]}>{caveat}</Text>
            </View>
          ) : null}
        </View>

        {/* ── What it means. Directly under the status card, because the card
               above says what the river IS and this says what to do about it.
               Hidden entirely when the river has no gauge or every upstream
               source failed — an empty interpretation is worse than none. ── */}
        {outlook ? <EddyTake outlook={outlook} /> : null}

        {/* ── The bell. The only paid affordance on this screen. ── */}
        <Pressable
          onPress={onNotify}
          disabled={subscribing}
          style={({ pressed }) => [
            styles.notifyButton,
            { backgroundColor: pressed ? colors.accentPressed : colors.accent },
          ]}
          accessibilityRole="button"
        >
          {subscribing ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Ionicons name="notifications-outline" size={18} color={colors.onAccent} />
          )}
          <Text style={[styles.notifyText, { color: colors.onAccent }]}>
            Notify me when it&apos;s floatable
          </Text>
        </Pressable>

        {/* ── Hazards. Free, and above access points on purpose. ── */}
        {sortedHazards.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Hazards</Text>
            {shownHazards.map((hazard) => {
              const hazardCode = hazardConditionCode(hazard.severity);
              const portage = portageNote(hazard);
              return (
                <View
                  key={hazard.id}
                  style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}
                >
                  <View style={styles.hazardHead}>
                    <View
                      style={[styles.severityDot, { backgroundColor: conditionColor(hazardCode) }]}
                    />
                    <Text style={[styles.hazardName, { color: colors.text }]}>{hazard.name}</Text>
                  </View>
                  <Text style={[styles.hazardMeta, { color: colors.textMuted }]}>
                    {severityLabel(hazard.severity)} · {hazardTypeLabel(hazard.type)}
                    {hazard.riverMile ? ` · Mile ${hazard.riverMile}` : ''}
                  </Text>
                  {hazard.description ? (
                    <Text style={[styles.hazardBody, { color: colors.textMuted }]}>
                      {hazard.description}
                    </Text>
                  ) : null}
                  {portage ? (
                    <View
                      style={[styles.portage, { backgroundColor: conditionBg(hazardCode) }]}
                    >
                      <Ionicons name="walk-outline" size={14} color={conditionInk(hazardCode)} />
                      <Text style={[styles.portageText, { color: conditionInk(hazardCode) }]}>
                        {portage}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {hiddenCount > 0 && !showAllHazards ? (
              <Pressable onPress={() => setShowAllHazards(true)} style={styles.moreRow} hitSlop={8}>
                <Text style={[styles.moreText, { color: colors.accent }]}>
                  Show {hiddenCount} more {hiddenCount === 1 ? 'hazard' : 'hazards'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Access points ───────────────────────────────────── */}
        {accessPoints.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Access points ({accessPoints.length})
            </Text>
            {accessPoints.map((point) => (
              <View
                key={point.id}
                style={[styles.accessRow, { backgroundColor: colors.card }, elevation(1)]}
              >
                <Ionicons
                  name={point.isPublic ? 'location' : 'lock-closed-outline'}
                  size={17}
                  color={point.isPublic ? colors.accent : colors.textSubtle}
                />
                <View style={styles.accessBody}>
                  <Text style={[styles.accessName, { color: colors.text }]}>{point.name}</Text>
                  <Text style={[styles.accessMeta, { color: colors.textMuted }]}>
                    Mile {point.riverMile}
                    {point.isPublic ? '' : ' · Private'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[styles.footnote, { color: colors.textSubtle }]}>
          Conditions come from USGS gauges and can trail the river. Always judge the water in front
          of you.
        </Text>
      </ScrollView>

      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        riverName={river.name}
        onPurchased={onPurchased}
      />

      <PushPrimer
        visible={primerOpen}
        riverName={river.name}
        onAllow={async () => {
          setPrimerOpen(false);
          // Spends the one-shot prompt. The outcome needs no handling here:
          // the subscription already exists either way, and someone who
          // declines still sees the change in the Alerts feed.
          await enable();
        }}
        onDismiss={() => setPrimerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  errorTitle: { ...t.lg, fontFamily: fonts.semibold },
  backLink: { ...t.sm, fontFamily: fonts.semibold },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  riverName: { ...t['3xl'], fontFamily: fonts.heading, paddingHorizontal: 4, marginTop: 6 },
  riverMeta: { ...t.sm, fontFamily: fonts.body, paddingHorizontal: 4, marginTop: 2, marginBottom: 16 },
  card: { padding: 16, borderRadius: 16, marginBottom: 10 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusHeadText: { flex: 1, gap: 8 },
  conditionChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  conditionChipText: { ...t.xs, fontFamily: fonts.semibold },
  reading: { ...t['2xl'], fontFamily: fonts.mono },
  noReading: { ...t.sm, fontFamily: fonts.body },
  percentileRow: { marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  percentileText: { ...t.sm, fontFamily: fonts.semibold },
  percentileMeta: { ...t.xs, fontFamily: fonts.mono, marginTop: 2 },
  updated: { ...t.xs, fontFamily: fonts.body, marginTop: 10 },
  caveat: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
  },
  caveatText: { ...t.xs, fontFamily: fonts.body, flex: 1 },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 22,
  },
  notifyText: { ...t.base, fontFamily: fonts.heading },
  section: { marginBottom: 18 },
  sectionTitle: { ...t.lg, fontFamily: fonts.heading, marginBottom: 10, paddingHorizontal: 4 },
  hazardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  severityDot: { width: 10, height: 10, borderRadius: 999 },
  hazardName: { ...t.base, fontFamily: fonts.semibold, flex: 1 },
  hazardMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 4 },
  hazardBody: { ...t.sm, fontFamily: fonts.body, marginTop: 8 },
  portage: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  portageText: { ...t.xs, fontFamily: fonts.semibold },
  moreRow: { alignItems: 'center', paddingVertical: 8 },
  moreText: { ...t.sm, fontFamily: fonts.semibold },
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderRadius: 12,
    marginBottom: 8,
  },
  accessBody: { flex: 1 },
  accessName: { ...t.sm, fontFamily: fonts.semibold },
  accessMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  footnote: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', paddingHorizontal: 24, marginTop: 6 },
});
