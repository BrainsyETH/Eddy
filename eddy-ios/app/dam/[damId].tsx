// eddy-ios/app/dam/[damId].tsx
// One USACE project: what it is releasing, what the lake is doing, and when the
// units are scheduled to run.
//
// ── Why a dam is its own screen and not a section on a river ───────────────
// Because most of these dams have no Eddy river below them. Somebody fishing
// Lake Taneycomo does not need Eddy to have onboarded Taneycomo as a float
// river; they need to know whether Table Rock is generating and how cold the
// tailwater is. That is a dam screen, and it needs no river content at all.
//
// Where a tailwater DOES exist, the relationship runs the other way too: the
// river screen shows a dam panel, and this screen links back. `tailwater` on
// the snapshot is what connects them.
//
// ── Structure follows app/gauge/[siteId].tsx ───────────────────────────────
// Same shell — hidden header, a back chevron in a navRow, a ScrollView, an
// explicit error body rather than a blank screen. This is a detail screen
// reached from a pin or a row, so it behaves like the app's other one.
//
// ── What it must never do ──────────────────────────────────────────────────
// Imply a release is a promise. The Corps changes schedules for power demand,
// transmission constraints, outages and inflow, and this screen sits next to a
// number somebody may wade into.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import { fetchDam } from '@/api/client';
import { DamStateCard } from '@/components/dam/DamStateCard';
import { DamGenerationHero } from '@/components/dam/DamGenerationHero';
import { DamPatternStrip } from '@/components/dam/DamPatternStrip';
import { GenerationSchedule } from '@/components/dam/GenerationSchedule';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { goBack } from '@/lib/nav';

export default function DamDetailScreen() {
  const { damId } = useLocalSearchParams<{ damId: string }>();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { isStarred, toggleStar } = useStarredRivers();

  const [dam, setDam] = useState<DamSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!damId) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const snapshot = await fetchDam(damId, controller.signal);
        if (controller.signal.aborted) return;
        setDam(snapshot);
      } catch {
        if (controller.signal.aborted) return;
        // fetchDam throws by design: this screen is opened from a row or a pin
        // that named the dam, so a failure here is a real one and gets said out
        // loud rather than absorbed into an empty screen.
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [damId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centre, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.interactive} />
      </SafeAreaView>
    );
  }

  if (!dam) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navRow}>
          <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.centre, styles.emptyBody]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {failed ? 'Dam unavailable' : 'Dam not found'}
          </Text>
          <Text style={[styles.emptyBodyText, { color: colors.textMuted }]}>
            {failed
              ? 'Could not reach the Corps’ feed. Check your connection and try again.'
              : `No project is published under ${damId}.`}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Everything upstream is read-through and allowed to fail independently, so a
  // dam can arrive with a schedule and no readings, or readings and no
  // schedule. Both are ordinary; only nothing at all is worth saying.
  const hasMetrics = Object.keys(dam.metrics).length > 0;
  const hasAnything = hasMetrics || dam.schedule.length > 0 || dam.generating !== null;

  const starred = isStarred('dam', dam.id);

  const onToggleStar = () => {
    toggleStar({
      kind: 'dam',
      entityId: dam.id,
      name: dam.name,
      // The TAILWATER river, when this dam controls one — context for the
      // favourites row, not a route. A dam opens its own screen off entityId.
      slug: dam.tailwater?.riverSlug ?? '',
    });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.navRow}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        {/* Same control, same place and same rules as the gauge screen's. A dam
            is a thing you come back to — "is Table Rock generating this
            weekend" is a question somebody asks every weekend — and until now
            the only way back was to find it in search again.

            Local-first and account-free, like every other star: see
            useStarredRivers. The id is the USACE registry slug rather than a
            uuid, which is why starred_dams carries no foreign key (00206). */}
        <Pressable
          onPress={onToggleStar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={starred ? `Unstar ${dam.name}` : `Star ${dam.name}`}
        >
          <Ionicons
            name={starred ? 'star' : 'star-outline'}
            size={24}
            color={starred ? colors.warm : colors.textSubtle}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.name, { color: colors.text }]}>{dam.name}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {[dam.lakeName, dam.state].filter(Boolean).join(' · ')}
        </Text>

        {/* The order is the hierarchy a fisherman reads in: what the powerhouse
            is doing now, when it changes, today and the days ahead, the rhythm
            it has kept all week — and only then the lake, the temperature and
            the rest of the project. */}
        {hasAnything ? (
          <>
            <View style={styles.section}>
              <DamGenerationHero dam={dam} />
            </View>
          </>
        ) : (
          // Not an error. Kansas City district publishes nothing to CWMS and
          // SWPA may not have refreshed yet, which is a real and temporary
          // state — saying so beats an empty screen that looks broken.
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
              <Text style={[styles.emptyBodyText, { color: colors.textMuted }]}>
                No readings or schedule are published for {dam.name} right now.
              </Text>
            </View>
          </View>
        )}

        {dam.schedule.length > 0 ? (
          <View style={styles.section}>
            <GenerationSchedule schedule={dam.schedule} reference={dam.generationReference} />
          </View>
        ) : null}

        {dam.pattern && dam.pattern.length > 0 ? (
          <View style={styles.section}>
            <DamPatternStrip
              pattern={dam.pattern}
              schedule={dam.schedule}
              reference={dam.generationReference}
              generationFloorCfs={dam.generationFloorCfs}
            />
          </View>
        ) : null}

        {/* The lake, the temperature and the rest of the project: still worth
            carrying, below the generation the reader came for. */}
        {hasAnything ? (
          <View style={styles.section}>
            <DamStateCard dam={dam} secondary />
          </View>
        ) : null}

        <View style={styles.actions}>
          {/* The reach this dam controls, when Eddy carries it. Absent for most
              projects, and absent is the honest state — a dam whose tailwater
              Eddy does not carry has no river screen to offer. */}
          {dam.tailwater ? (
            <Pressable
              // `section` names the reach this dam actually controls, when the
              // river carries more than one. Without it the Black opens on the
              // spring-fed Lesterville float — rain-driven water Clearwater has
              // no bearing on — and nothing marks which half you came for.
              onPress={() =>
                router.push({
                  pathname: '/river/[slug]',
                  params: {
                    slug: dam.tailwater!.riverSlug,
                    ...(dam.tailwater!.sectionSlug
                      ? { section: dam.tailwater!.sectionSlug }
                      : {}),
                    // The station that reads THIS dam's tailwater, so the river
                    // screen opens on the water below the dam rather than on
                    // whichever gauge the river calls primary — which on the
                    // Black is deliberately not this one.
                    gauge: dam.tailwater!.gaugeSiteId,
                  },
                })
              }
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: pressed
                    ? colors.interactivePressed
                    : colors.interactive,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.actionText, { color: colors.onInteractive }]}>
                Open the river below this dam
              </Text>
            </Pressable>
          ) : null}

          {/* ── Tell me when it changes ──
              Only where a TAILWATER STATION exists, which today means
              Clearwater alone. That is not a placeholder for the other nine: a
              release is only alertable because migration 00198 registered it as
              a gauge station, so it flows through ingestion, threshold banding
              and the alert evaluator like any other discharge. The dams without
              one publish to CWMS and SWPA and to nothing this app can watch, so
              they get no bell rather than a bell that cannot fire.

              Routed at the GAUGE scope, not a dam scope — there is no such
              scope, and inventing one would mean a second evaluator for a
              number the existing one already reads. The configure screen opens
              on "My own level" of its own accord: 00198 leaves the ladder
              levels NULL on purpose, because calibrating a floatability ladder
              for a dam release is a safety judgement Eddy would be held to, and
              the screen now tests for levels rather than for the row. */}
          {dam.tailwater?.gaugeSiteId ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/alerts/configure',
                  params: {
                    scope: 'gauge',
                    siteId: dam.tailwater!.gaugeSiteId,
                    gaugeName: `${dam.name} release`,
                  },
                })
              }
              style={({ pressed }) => [
                styles.sourceButton,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Set a release alert for ${dam.name}`}
            >
              <Ionicons name="notifications-outline" size={16} color={colors.text} />
              <Text style={[styles.sourceText, { color: colors.text }]}>
                Alert me about the release
              </Text>
            </Pressable>
          ) : null}

          {/* The recorded line. Kept because it is the fallback when a feed is
              down, which is exactly when somebody most needs the number — and
              it is the Corps' own answer rather than Eddy's. */}
          {dam.infoPhone ? (
            <Pressable
              onPress={() => void Linking.openURL(`tel:${dam.infoPhone}`)}
              style={({ pressed }) => [
                styles.sourceButton,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Call the recorded release line for ${dam.name}`}
            >
              {/* The icon is what says this DIALS. Without it the row read as
                  another fact about the dam sitting next to a number, rather
                  than the one control on the screen that leaves the app. */}
              <Ionicons name="call-outline" size={16} color={colors.text} />
              <Text style={[styles.sourceText, { color: colors.text }]}>
                Recorded release line · {dam.infoPhone}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {dam.sources.length > 0 ? (
          <Text style={[styles.sources, { color: colors.textSubtle }]}>
            Source: {dam.sources.join(' · ')}.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  emptyBody: { flex: 1, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { ...t.xl, fontFamily: fonts.heading, textAlign: 'center' },
  emptyBodyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  body: { paddingBottom: 40 },
  name: { ...t['2xl'], fontFamily: fonts.heading, paddingHorizontal: 20, marginTop: 4 },
  meta: { ...t.sm, fontFamily: fonts.body, paddingHorizontal: 20, marginTop: 2, marginBottom: 14 },
  section: { paddingHorizontal: 16, marginBottom: 14 },
  card: { borderRadius: 14, padding: 16 },
  actions: { paddingHorizontal: 16, gap: 10 },
  action: { paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  actionText: { ...t.base, fontFamily: fonts.semibold },
  sourceButton: {
    // A row, so a button can carry a leading icon. With a single Text child
    // this renders identically to the centred column it replaced.
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  sourceText: { ...t.sm, fontFamily: fonts.medium },
  sources: { ...t.xs, paddingHorizontal: 20, marginTop: 14 },
});
