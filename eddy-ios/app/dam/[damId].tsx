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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import { fetchRivers } from '@/api/client';
import { getSharedDam, peekSharedDams } from '@/hooks/useDams';
import { DAM_CATALOG } from '@/lib/damCatalog';
import { readBestIndex } from '@/lib/riverCache';
import { DamStateCard } from '@/components/dam/DamStateCard';
import { GenerationCard } from '@/components/dam/GenerationCard';
import { DamPatternStrip } from '@/components/dam/DamPatternStrip';
import { GenerationForecast } from '@/components/dam/GenerationForecast';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { goBack } from '@/lib/nav';

export default function DamDetailScreen() {
  const { damId } = useLocalSearchParams<{ damId: string }>();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { isStarred, toggleStar } = useStarredRivers();

  /**
   * Who this dam is, out of the binary.
   *
   * The Corps does not move Bull Shoals, so a name and a lake need no network
   * — and this screen used to hold a full-screen spinner over both for the
   * five to fifty seconds /api/dams/[damId] takes cold. See damCatalog.ts,
   * which shipped this half of a dam as source for exactly this argument on
   * the map layer.
   *
   * Null for a dam this build does not carry, which is possible: the registry
   * can gain a project while a binary is in the field. That case keeps the old
   * behaviour of waiting, because there is genuinely nothing to draw.
   */
  const catalogEntry = useMemo(
    () => DAM_CATALOG.find((entry) => entry.id === damId) ?? null,
    [damId],
  );

  /**
   * The snapshot on screen, HELD WITH THE DAM IT DESCRIBES.
   *
   * Keyed by damId for the reason the river screen's `damFor` is: three
   * asynchronous writers land here — the shared summary store, the detail
   * fetch, and the silent focus refetch — and a screen re-pointed at another
   * project must not show the previous one's release for even one frame.
   *
   * `detailed` records WHICH KIND of snapshot it is. A summary carries three
   * metrics and two days of schedule; the detail carries seven and three, plus
   * the observed week and the forecast. They are the same shape and not the
   * same answer, and the difference decides whether a missing section means
   * "this dam has none" or "we have not asked yet".
   */
  const [held, setHeld] = useState<{
    damId: string;
    dam: DamSnapshot;
    detailed: boolean;
  } | null>(null);

  /**
   * What is on screen: the fetched detail, or the summary every list surface
   * already holds, or nothing.
   *
   * ── It PEEKS. It never fetches ────────────────────────────────────────────
   *
   * peekSharedDams answers from the module cache the map layer, the Today tab's
   * Dams scope and the Favourites list all fill, and returns null when there is
   * nothing in it. So arriving from any of those surfaces paints on the first
   * frame from data that is already correct, and arriving by deep link paints
   * the catalog's name and waits for the detail — which is the right trade,
   * because the alternative is what this used to do: call getSharedDams, and
   * issue a request for TWENTY dams alongside the request for the one dam the
   * reader actually opened. The twenty-dam route is the slower of the two. The
   * seed could not win that race; it could only compete in it.
   *
   * ── The seed is DERIVED, not stored ───────────────────────────────────────
   *
   * peekSharedDams is synchronous, so there is nothing here to wait for, and an
   * effect that set it into state would be a second render to display data the
   * first render already had. This is the case React's own guidance names for
   * adjusting during render, and it is what the river screen's `damFor` does
   * for the same value.
   *
   * It also means the seed can APPEAR while the screen is open, if another
   * surface fills the store in the meantime — which is strictly better than a
   * one-shot read at mount, and is free.
   *
   * `held` wins whenever it names this dam, so a three-metric summary can never
   * be shown over a seven-metric detail that has already arrived.
   */
  const dam =
    held?.damId === damId
      ? held.dam
      : (peekSharedDams()?.find((entry) => entry.id === damId) ?? null);

  /**
   * The damId whose detail request has settled — succeeded or failed.
   *
   * Not a boolean, so that a change of dam re-arms it without an effect having
   * to remember to clear it, and so a late answer for the previous project
   * cannot mark this one as settled.
   */
  const [detailSettledFor, setDetailSettledFor] = useState<string | null>(null);
  const detailPending = detailSettledFor !== damId;
  const [failed, setFailed] = useState(false);

  /**
   * The rivers the app can actually OPEN, for gating the tailwater button.
   *
   * The snapshot's `tailwater` block is registry fact — the dam does control
   * that reach — but /api/rivers serves ACTIVE rivers only, and the three new
   * tailwaters landed inactive, staged behind their access points. The wire
   * carries the block regardless (it also feeds the release-alert button and
   * the water-quality card, which must keep working), so the fact that a
   * river page exists to open has to be checked here. Without this check the
   * one filled, accent-coloured button on Bull Shoals, Norfork and Table Rock
   * pushed /river/[slug] straight into "River not found".
   *
   * Null until answered; the button waits for a yes. On a fetch failure the
   * offline index answers — a phone that cannot reach /api/rivers could not
   * have opened the river screen either, so hiding the button then is the
   * honest default, not a loss.
   */
  const [knownRiverSlugs, setKnownRiverSlugs] = useState<Set<string> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const rivers = await fetchRivers(controller.signal);
        if (!controller.signal.aborted) {
          setKnownRiverSlugs(new Set(rivers.map((r) => r.slug)));
        }
      } catch {
        // readBestIndex, so a first launch answers too: the bundle seeds which
        // rivers exist, and "which rivers exist" is the entire question here.
        // With readIndex this fell through to null on a fresh install and hid
        // the tailwater button on the one screen that most wants to offer it.
        const cached = await readBestIndex();
        if (!controller.signal.aborted && cached) {
          setKnownRiverSlugs(new Set(cached.payload.map((r) => r.slug)));
        }
      }
    })();
    return () => controller.abort();
  }, []);

  /**
   * The whole screen's clock, ticked once a minute.
   *
   * ── Why a screen this static needs a clock ─────────────────────────────────
   * Everything below is phrased against `Date.now()` at render: which hour the
   * schedule marker sits in, whether the observation still speaks in the present
   * tense, where the pattern strip hands off from measured to scheduled. With no
   * re-render, all three freeze at mount — so a screen opened at 9:55, put in a
   * pocket and looked at again at noon would still say "GENERATING NOW" over a
   * reading that had aged out of the present tense two hours earlier.
   *
   * A minute is the resolution of every one of those claims; anything finer is
   * re-rendering to move nothing.
   */
  const [, setTick] = useState(0);
  // Focus-gated: a screen buried under another in the stack has nobody
  // reading its tenses, and the river↔dam pair used to bury copies that all
  // kept ticking. Blur tears the interval down; return restarts it, and the
  // silent focus reload below re-renders with fresh data anyway, so the
  // tenses are right again before the next tick is due.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => setTick((n) => n + 1), 60_000);
      return () => clearInterval(id);
    }, []),
  );

  /**
   * The dam whose first load has SETTLED, so a focus is not an arrival.
   *
   * Settled, not started. It used to be stamped when the arrival load was
   * dispatched, so a blur during that load — tap the tailwater river link
   * while the summary-seeded body is up, come back — aborted it (the finally
   * below skips the settle on an aborted signal) and left the stamp in place.
   * The next focus then counted as a silent refresh: not allowed to declare a
   * failure, not allowed to mark the detail settled. On a failure the pending
   * row spun for good and "Try again" had no branch to render in.
   */
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(
    (signal: AbortSignal, primary: boolean) => {
      if (!damId) return;
      // `primary` used to mean "blank the screen"; it now means "this is the
      // arrival, not the focus refresh" — which is still the only load allowed
      // to declare a failure or to mark the detail settled.
      if (primary) setDetailSettledFor(null);

      void (async () => {
        try {
          // The SHARED request, not a private one. Two callers can arrive
          // within a frame — a focus and a retry — and each paying for its own
          // read of a route that reads through to CWMS and SWPA is how this
          // screen came to make three concurrent dam requests on one
          // navigation. No signal is passed because the request is shared; the
          // aborted check below still keeps a late answer off a dead screen.
          const snapshot = await getSharedDam(damId);
          if (signal.aborted) return;
          // Unconditional, unlike the summary seed above: this IS the richer
          // answer, and a refetch of it is the newest one.
          setHeld({ damId, dam: snapshot, detailed: true });
          setFailed(false);
        } catch {
          if (signal.aborted) return;
          // getSharedDam rejects by design, as fetchDam does: this screen is
          // opened from a row or a pin
          // that named the dam, so a failure here is a real one and gets said
          // out loud rather than absorbed into an empty screen.
          //
          // A REFRESH failure is different and must not blank a screen that is
          // already showing good data — the reading keeps its honest age
          // instead.
          if (primary) setFailed(true);
        } finally {
          // Marked settled on BOTH paths. This is what turns "no schedule yet"
          // into "this dam publishes no schedule", so leaving it unset after a
          // failure would hold a loading row on screen forever.
          //
          // And only NOW is the arrival over: an aborted arrival leaves the
          // stamp clear so the next focus arrives again, spinner and all.
          if (!signal.aborted && primary) {
            setDetailSettledFor(damId);
            loadedFor.current = damId;
          }
        }
      })();
    },
    [damId]
  );

  /**
   * Bumped by "Try again". The error copy always said try again; the load
   * living in effects meant there was no control to do it with, short of
   * leaving the screen and coming back.
   */
  const [reloadNonce, setReloadNonce] = useState(0);

  const retry = useCallback(() => {
    // A retry IS an arrival again: it must show the spinner and own the failure
    // copy, which is what `primary` decides below.
    loadedFor.current = null;
    setReloadNonce((n) => n + 1);
  }, []);

  /**
   * The ONLY loader on this screen.
   *
   * ── Why there is no mount effect beside it ────────────────────────────────
   * Because useFocusEffect already fires on mount — expo-router runs the
   * callback immediately when the screen is focused, which it is. Keeping a
   * mount effect too meant TWO fetchDam calls on every arrival, on a route that
   * reads through to CWMS and SWPA live. With the summary seed calling
   * getSharedDams as well, a cold deep link made three concurrent requests for
   * one dam.
   *
   * This is the arrangement the river screen's loadDam settled on for the same
   * pair of effects and the same reason; its header records what the duplicate
   * cost there, including a race where the slower call carried a flag that
   * blanked a row which had been correct on screen for ten seconds.
   *
   * ── Why it still refetches ────────────────────────────────────────────────
   * A payload that arrives once and never again is cached data with no cache
   * policy: a screen backgrounded and resumed hours later would re-render the
   * same numbers while the ages beside it, computed on this device, correctly
   * read "9 hours ago". Every focus after the first is a SILENT refresh, so
   * coming back never flashes a spinner over data already on screen.
   */
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      // Stamped by load() when the arrival settles, not here when it starts.
      const arriving = loadedFor.current !== damId;
      load(controller.signal, arriving);
      return () => controller.abort();
    }, [load, damId, reloadNonce])
  );

  // NOTHING AT ALL, and still asking: a dam this build does not carry, opened
  // before either request answered. The only case left where this screen is a
  // spinner — a catalogued dam paints its name and lake on the first frame.
  //
  // The chevron renders DURING the load, same rule configure.tsx states for
  // itself: this fetch reads through to CWMS and SWPA and can run five to
  // fifty seconds cold, and a spinner with no chevron is that long with no
  // visible way off the screen.
  if (!dam && !catalogEntry && detailPending) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navRow}>
          <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.screen, styles.centre]}>
          <ActivityIndicator size="large" color={colors.interactive} />
        </View>
      </SafeAreaView>
    );
  }

  if (!dam && !detailPending) {
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
          {/* The name, when the binary carries one. A failed request does not
              make Bull Shoals anonymous, and "Dam unavailable" over a bare
              slug reads like the app lost the dam rather than the reading. */}
          {failed && catalogEntry ? (
            <Text style={[styles.emptyBodyText, { color: colors.textMuted }]}>
              {catalogEntry.name}
            </Text>
          ) : null}
          {/* The control the copy promises. Failure only — a "not found" is
              an answer, not an outage. */}
          {failed ? (
            <Pressable
              onPress={retry}
              style={({ pressed }) => [
                styles.sourceButton,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.sourceText, { color: colors.text }]}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  /**
   * The name is up; the water is not here yet.
   *
   * Reached only on a deep link or a first launch — arriving from the map, the
   * Today tab or Favourites means the shared summary store is already warm and
   * the branch below renders on the first frame. So this is the narrow case of
   * a catalogued dam with no snapshot from either source YET, and what it
   * shows is the half of a dam that ships in the binary.
   *
   * ── Why no star here ──────────────────────────────────────────────────────
   * A star record carries the tailwater river as context, and the tailwater is
   * a property of the snapshot rather than of the catalog. Starring now would
   * write a row that names the dam and not the reach it controls, and quietly
   * keep it. The control appears with the data that makes it correct, which is
   * a moment later.
   */
  if (!dam) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navRow}>
          <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[styles.name, { color: colors.text }]}>{catalogEntry!.name}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {[catalogEntry!.lakeName, catalogEntry!.state].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.section}>
            <ActivityIndicator color={colors.interactive} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Everything upstream is read-through and allowed to fail independently, so a
  // dam can arrive with a schedule and no readings, or readings and no
  // schedule. Both are ordinary; only nothing at all is worth saying.
  const hasMetrics = Object.keys(dam.metrics).length > 0;
  const hasAnything =
    hasMetrics || dam.schedule.length > 0 || dam.generating !== null || Boolean(dam.generationForecast);

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
            color={starred ? colors.favorite : colors.textSubtle}
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
              {/* One card, two sections: observed above the rule, scheduled
                  below it. They were two cards saying the same thing twice —
                  a NEXT CHANGE panel over a schedule describing the same plan,
                  each carrying its own copy of the publisher, the freshness and
                  the change warning. See GenerationCard. */}
              <GenerationCard dam={dam} />
            </View>
          </>
        ) : detailPending || failed ? (
          // STILL ASKING, or ASKED AND FAILED — neither of which is the claim
          // below, and neither may be dressed as it. A summary snapshot can
          // arrive with nothing in it (the shared store's own request may have
          // failed for this project), so "no readings are published" over a
          // request that has not answered, or that errored, is a fact this
          // screen does not have. The row underneath says which state it is in.
          <View style={styles.section} />
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

        {/* WHAT IS STILL COMING, OR WHAT DID NOT ARRIVE.
            A summary carries three metrics and two days of schedule; the pool
            level, the tailwater temperature, the observed week and the forecast
            are all in the detail request. While that request is in flight their
            absence means "not yet"; once it has FAILED their absence means "we
            could not ask" — and neither is the "this project does not publish
            it" that an unexplained gap reads as. That distinction is what the
            rest of this screen is careful about, and a partial page that did
            not say which state it was in would quietly give it up.

            Drawn until the DETAIL itself lands, so it covers both the empty
            case above and a summary that is showing real readings with the
            lake and the temperature still missing from it. */}
        {!held?.detailed && (detailPending || failed) ? (
          <View style={[styles.section, styles.pendingRow]}>
            {detailPending ? (
              <>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={[styles.emptyBodyText, { color: colors.textMuted }]}>
                  Loading the lake, the temperature and the full schedule…
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.emptyBodyText, { color: colors.textMuted }]}>
                  Couldn’t load the lake, the temperature or the full schedule.
                </Text>
                <Pressable
                  onPress={retry}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={[styles.sourceText, { color: colors.interactive }]}>Try again</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {/* The schedule is no longer its own section: it is the lower half of
            the Generation card above. A dam with a schedule but NO powerhouse
            reading still gets it — GenerationCard draws the hero's half empty
            rather than dropping the card. */}

        {/* The forecast sits where the schedule would: it answers the same
            "today and the days ahead" question from a different kind of
            source — a district's operating forecast rather than a power
            marketer's loading schedule. No dam currently has both. */}
        {dam.generationForecast ? (
          <View style={styles.section}>
            <GenerationForecast forecast={dam.generationForecast} />
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
          {dam.tailwater && knownRiverSlugs?.has(dam.tailwater.riverSlug) ? (
            <Pressable
              // `section` names the reach this dam actually controls, when the
              // river carries more than one. Without it the Black opens on the
              // spring-fed Lesterville float — rain-driven water Clearwater has
              // no bearing on — and nothing marks which half you came for.
              //
              // navigate, not push: the river's TailwaterStatusRow links back
              // here, and push let the pair stack copies indefinitely.
              onPress={() =>
                router.navigate({
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
  /** The "still loading the rest" line: a spinner and its sentence, centred. */
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
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
