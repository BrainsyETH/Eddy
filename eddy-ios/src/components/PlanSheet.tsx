// eddy-ios/src/components/PlanSheet.tsx
// The float plan flow: put-in, take-out, answer.
//
// Everything on this screen is FREE. The plan is the reason someone opens Eddy
// on a Thursday night, and gating it would gate the product. The paid line runs
// somewhere else entirely — being told when a river changes, and carrying the
// map past the end of cell coverage.
//
// ── Two taps to an answer ───────────────────────────────────────────────────
// There used to be a third step here: pick a boat. It is gone. A required tap
// that moves the answer less than the wind does is a tap that only ever loses
// people between "I picked two access points" and "how long is it" — see the
// note at the top of useFloatPlan. The plan still carries the vessel the speed
// model used; the basis line under the estimate no longer names it, and
// floatTimeCeilingBasisNote says why.
//
// ── Structure ───────────────────────────────────────────────────────────────
// This file owns the FLOW — the breadcrumb, the two pickers, and the sheet they
// live in. The answer itself is PlanResult, which is shared with the screen that
// opens a saved float: a shared plan that read differently from the plan that
// produced it would be a plan nobody trusts.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan, MapAccessPoint, RiverListItem } from '@eddy/types';
import { accessTypeLabel } from '@eddy/types';
import { saveFloatPlan } from '@/api/client';
import { haptics } from '@/theme/haptics';
import { planShareSummary } from '@/lib/planCopy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { placeSymbol } from '@/components/map-sheet/placeSymbol';
import { Otter } from '@/components/Otter';
import { PlanResult } from '@/components/PlanResult';
import type { FloatPlanState } from '@/hooks/useFloatPlan';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { milesBetween, type Coords } from '@/hooks/useLocation';
import { damControlledLabel } from '@/lib/readingCopy';
import { conditionColor } from '@/theme/conditions';

interface Props {
  visible: boolean;
  onClose: () => void;
  rivers: RiverListItem[];
  river: RiverListItem | null;
  riverDistances: ReadonlyMap<string, number> | null;
  onSelectRiver: (river: RiverListItem) => void;
  onClearRiver: () => void;
  riverLoading: boolean;
  state: FloatPlanState;
  /**
   * Where the user is, if they have already granted it on the map. Never
   * requested from in here — a sheet that prompts for location the moment it
   * opens spends the one-shot iOS dialog on a screen the user came to for a
   * different reason.
   */
  userCoords?: Coords | null;
}


export function PlanSheet({
  visible,
  onClose,
  rivers,
  river,
  riverDistances,
  onSelectRiver,
  onClearRiver,
  riverLoading,
  state,
  userCoords,
}: Props) {
  const { colors } = useTheme();
  const { remember, isSaved, forgetPlan } = useSavedFloats();
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { step, putIn, takeOut, plan, calculating, error } = state;

  const onShare = useCallback(async () => {
    if (!plan) return;
    setSharing(true);
    try {
      const saved = await saveFloatPlan(plan);
      // NOT remembered. Sharing a float writes a row server-side — that is how
      // the link exists at all — but it says nothing about whether the sender
      // wants to keep it, and filing every share under Favorites made that list
      // a log of things sent rather than a list of things chosen. The star
      // beside this button is where keeping happens now.
      // The same headline the sender is looking at (planCopy), with the link
      // passed as `url` too so Mail and AirDrop get a link object rather than
      // a bare string.
      await Share.share({
        message: `${planShareSummary(plan)}\n${saved.url}`,
        url: saved.url,
      });
    } catch {
      // A share that cannot be saved falls back to the numbers themselves.
      // Losing the short link is worth far less than losing the share.
      await Share.share({ message: planShareSummary(plan) });
    } finally {
      setSharing(false);
    }
  }, [plan]);

  const saved = plan ? isSaved(plan) : false;

  /**
   * Keep this float, or stop keeping it.
   *
   * ONE ROUND TRIP, and it is not optional. What Favorites stores is a stub —
   * the river, the two ends, the date — and the plan itself is always re-read
   * from the server when you open it, because a float kept in April and opened
   * in July is the same stretch and completely different water. The server row
   * is what makes that re-read possible, so keeping a float means asking for
   * one. See the header of useSavedFloats.
   *
   * A failure says so and changes nothing. A star that fills in and then has
   * nothing behind it is worse than a star that refuses.
   */
  const onToggleSave = useCallback(async () => {
    if (!plan) return;
    setSaveError(null);
    if (saved) {
      forgetPlan(plan);
      return;
    }
    setSaving(true);
    try {
      remember(plan, await saveFloatPlan(plan));
      haptics.success();
    } catch {
      setSaveError('Could not save this float. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [plan, saved, remember, forgetPlan]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={[styles.title, { color: colors.text }]}>Plan a float</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {river?.name ?? 'Choose a river'}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        </View>

        {!river ? (
          <RiverList
            rivers={rivers}
            distances={riverDistances}
            onSelect={onSelectRiver}
          />
        ) : (
          <Breadcrumb state={state} riverName={river.name} onChooseRiver={onClearRiver} />
        )}

        {!river ? null : riverLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.interactive} />
            <Text style={[styles.calculating, { color: colors.textMuted }]}>Loading put-ins…</Text>
          </View>
        ) : step === 'put-in' ? (
          <AccessPointList
            points={state.putInOptions}
            emptyMessage="This river has no mapped access points yet."
            onSelect={state.choosePutIn}
            selectedId={putIn?.id ?? null}
            userCoords={userCoords}
          />
        ) : step === 'take-out' ? (
          <AccessPointList
            points={state.takeOutOptions}
            fromMile={putIn?.riverMile ?? null}
            emptyMessage={`There is nothing downstream of ${putIn?.name ?? 'that put-in'}. Pick one further up the river.`}
            onSelect={state.chooseTakeOut}
            selectedId={takeOut?.id ?? null}
          />
        ) : calculating ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.interactive} />
            <Text style={[styles.calculating, { color: colors.textMuted }]}>
              Reading the gauge and driving the shuttle…
            </Text>
          </View>
        ) : error || !plan ? (
          <View style={styles.centered}>
            <Otter mood="flag" size={100} />
            <Text style={[styles.errorText, { color: colors.text }]}>
              {error ?? 'Could not build that float plan'}
            </Text>
            <Pressable onPress={state.reset} hitSlop={10}>
              <Text style={[styles.link, { color: colors.interactive }]}>Start over</Text>
            </Pressable>
          </View>
        ) : (
          <PlanResult
            plan={plan}
            actions={
              <View style={styles.actions}>
                {/* Keep and Share, side by side and the same size, because they
                    are two different intentions and neither is a side effect of
                    the other. Share used to quietly do both. */}
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => void onToggleSave()}
                    disabled={saving}
                    style={({ pressed }) => [
                      styles.saveButton,
                      {
                        borderColor: saved ? colors.warm : colors.border,
                        backgroundColor: saved ? colors.cardRaised : 'transparent',
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: saved }}
                    accessibilityLabel={
                      saved ? 'Remove this float from favorites' : 'Save this float to favorites'
                    }
                  >
                    {saving ? (
                      <ActivityIndicator color={colors.interactive} size="small" />
                    ) : (
                      <Ionicons
                        name={saved ? 'star' : 'star-outline'}
                        size={17}
                        color={saved ? colors.favorite : colors.textMuted}
                      />
                    )}
                    <Text
                      style={[
                        styles.saveButtonText,
                        { color: saved ? colors.text : colors.textMuted },
                      ]}
                    >
                      {saved ? 'Saved' : 'Save'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void onShare()}
                    disabled={sharing}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      {
                        backgroundColor: pressed
                          ? colors.accentFillPressed
                          : colors.accentFill,
                      },
                    ]}
                    accessibilityRole="button"
                  >
                    {sharing ? (
                      <ActivityIndicator color={colors.onAccent} size="small" />
                    ) : (
                      <Ionicons name="share-outline" size={17} color={colors.onAccent} />
                    )}
                    <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>
                      Share
                    </Text>
                  </Pressable>
                </View>

                {saveError ? (
                  <Text style={[styles.actionError, { color: colors.error }]}>{saveError}</Text>
                ) : null}

                <Pressable
                  onPress={state.reset}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>
                    Plan a different stretch
                  </Text>
                </Pressable>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

/**
 * Where you are in the flow, and the way back.
 *
 * Every completed step is a button. Changing the put-in three taps in is the
 * single most common correction in a planner, and making it a back-out-and-
 * start-again is what makes people give up on one.
 */
function Breadcrumb({
  state,
  riverName,
  onChooseRiver,
}: {
  state: FloatPlanState;
  riverName: string;
  onChooseRiver: () => void;
}) {
  const { colors } = useTheme();
  /**
   * Each step wears Eddy's own mark for the thing it is asking about.
   *
   * A river is Eddy's river; both ends of the float are Eddy's access-point
   * mark, and they are deliberately THE SAME mark — a put-in and a take-out are
   * one kind of place, and inventing two drawings would claim a distinction the
   * data does not make. What separates them is the crumb's own text, which is
   * either the step's name or the place chosen for it.
   */
  const crumbs: {
    step: 'river' | 'put-in' | 'take-out';
    label: string;
    symbol: EddySymbolName;
    value?: string;
  }[] = [
    { step: 'river', label: 'River', symbol: 'river', value: riverName },
    { step: 'put-in', label: 'Put-in', symbol: 'accessPoint', value: state.putIn?.name },
    { step: 'take-out', label: 'Take-out', symbol: 'accessPoint', value: state.takeOut?.name },
  ];

  return (
    <View style={[styles.breadcrumb, { borderBottomColor: colors.border }]}>
      {crumbs.map((crumb, index) => {
        const current = crumb.step !== 'river' && state.step === crumb.step;
        // A step is reachable once the one before it has an answer. Nothing
        // below can be tapped into out of order, so the machine cannot be put
        // into a state where a take-out exists without a put-in.
        const reachable = index < 2 || Boolean(crumbs[index - 1].value);
        // Answered AND not the step being edited. A crumb you are standing in
        // is not done, however much data it holds.
        const done = Boolean(crumb.value) && !current;
        const ink = current
          ? colors.interactive
          : reachable
            ? colors.text
            : colors.textSubtle;
        return (
          <Pressable
            key={crumb.step}
            disabled={!reachable}
            onPress={() =>
              crumb.step === 'river' ? onChooseRiver() : state.goToStep(crumb.step)
            }
            /* ── A chip, not three columns of grey text ──────────────
               Changing the put-in is the single most common correction anybody
               makes in this flow, and the control for it was three stacked
               12pt labels whose only signal that they could be tapped was a
               colour change — which is to say, no signal at all for anyone not
               comparing two of them side by side, and none whatsoever for
               anyone who cannot distinguish the two greys.

               A bordered chip reads as a control at a glance.

               ── The mark took the checkmark's slot ──────────────────
               A checkmark used to lead an answered crumb, and it cannot share
               the leading position with the symbol: a third of a phone's width
               minus a 15pt mark, a 13pt tick and two gaps leaves about eight
               characters for a place called Meramec State Park. The state is
               still carried without colour — an answered crumb reads the place
               and an unanswered one reads the step, which is a stronger signal
               than a tick was, and its mark is dimmed until it has an answer. */
            style={({ pressed }) => [
              styles.crumb,
              {
                borderColor: current
                  ? colors.interactive
                  : reachable
                    ? colors.border
                    : 'transparent',
                backgroundColor: current ? colors.selectionBg : 'transparent',
                opacity: pressed && reachable ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${crumb.label}${crumb.value ? `: ${crumb.value}` : ', not chosen yet'}`}
            accessibilityState={{ selected: current, disabled: !reachable }}
          >
            <EddySymbol
              name={crumb.symbol}
              size={15}
              style={{ opacity: done || current ? 1 : 0.45 }}
            />
            {/* Two lines, not one: "Meramec State Park" in a third of the
                width truncated at the default size and worse at AX sizes. */}
            <Text style={[styles.crumbValue, { color: ink }]} numberOfLines={2}>
              {crumb.value ?? crumb.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RiverList({
  rivers,
  distances,
  onSelect,
}: {
  rivers: RiverListItem[];
  distances: ReadonlyMap<string, number> | null;
  onSelect: (river: RiverListItem) => void;
}) {
  const { colors, elevation } = useTheme();

  if (rivers.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.interactive} />
        <Text style={[styles.calculating, { color: colors.textMuted }]}>Loading rivers…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={[styles.pickerIntro, { color: colors.textMuted }]}>Where do you want to float?</Text>
      {rivers.map((river) => {
        const distance = distances?.get(river.slug) ?? null;
        const code = river.currentCondition?.code ?? 'unknown';
        return (
          <Pressable
            key={river.id}
            onPress={() => onSelect(river)}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: colors.card, opacity: pressed ? 0.65 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Plan a float on ${river.name}`}
          >
            <EddySymbol name="river" size={20} />
            <View style={styles.optionBody}>
              <Text style={[styles.optionName, { color: colors.text }]} numberOfLines={1}>
                {river.name}
              </Text>
              <View style={styles.riverMetaRow}>
                <View style={[styles.conditionDot, { backgroundColor: conditionColor(code) }]} />
                <Text style={[styles.optionMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {[
                    damControlledLabel(river.riverType, code) ?? river.currentCondition?.label ?? 'Condition unknown',
                    river.region,
                    distance != null
                      ? `${distance < 10 ? distance.toFixed(1) : distance.toFixed(0)} mi away`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AccessPointList({
  points,
  onSelect,
  selectedId,
  emptyMessage,
  fromMile,
  userCoords,
}: {
  points: MapAccessPoint[];
  onSelect: (point: MapAccessPoint) => void;
  selectedId: string | null;
  emptyMessage: string;
  /** Set on the take-out step so each row can show the float length it makes. */
  fromMile?: number | null;
  /** Set on the PUT-IN step only, enabling a nearest-first ordering. */
  userCoords?: Coords | null;
}) {
  const { colors, elevation } = useTheme();
  // Headwaters-first by default. That is the order a river runs in, and it is
  // the order someone who knows the river thinks in — so nearest-first is an
  // option rather than the default, even when we know where they are.
  const [nearestFirst, setNearestFirst] = useState(false);

  const distances = useMemo(() => {
    if (!userCoords) return null;
    const map = new Map<string, number>();
    for (const point of points) {
      map.set(point.id, milesBetween(userCoords, point.coordinates));
    }
    return map;
  }, [points, userCoords]);

  const ordered = useMemo(() => {
    if (!nearestFirst || !distances) return points;
    return [...points].sort(
      (a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity),
    );
  }, [points, nearestFirst, distances]);

  if (points.length === 0) {
    return (
      <View style={styles.centered}>
        {/* Both messages this renders are about picking a point — no mapped
            access points, or nothing downstream of the put-in — so it shows
            Eddy over a map, not a mood for a river nobody has read.
            The error branch above keeps the canonical `flag` otter. */}
        <EddyScene name="routePlanning" size={100} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {/* Shown only when we already know where they are — the map's locate
          button is the one place that asks. A sort control that prompts for a
          permission when tapped is a trap. */}
      {distances ? (
        <Pressable
          onPress={() => setNearestFirst((prev) => !prev)}
          style={({ pressed }) => [
            styles.sortRow,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: nearestFirst }}
        >
          <Ionicons
            name={nearestFirst ? 'navigate' : 'navigate-outline'}
            size={14}
            color={nearestFirst ? colors.interactive : colors.textMuted}
          />
          <Text
            style={[styles.sortText, { color: nearestFirst ? colors.text : colors.textMuted }]}
          >
            {nearestFirst ? 'Nearest to you' : 'Downstream order'}
          </Text>
        </Pressable>
      ) : null}

      {ordered.map((point) => {
        const selected = point.id === selectedId;
        const miles = fromMile != null ? point.riverMile - fromMile : null;
        const away = distances?.get(point.id) ?? null;
        return (
          <Pressable
            key={point.id}
            onPress={() => onSelect(point)}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: selected ? colors.cardRaised : colors.card, opacity: pressed ? 0.65 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            {/* WHAT IT LOOKS LIKE, on the screen where a put-in is being
                chosen. The name is a label and the river mile is a coordinate;
                neither answers the question somebody has standing in a driveway
                with a boat on the roof, which is whether they can get down
                there. The photo does, and it has been on the wire the whole
                time — see imageUrls on MapAccessPoint.

                ── ONE WELL, PHOTO OR NOT ────────────────────────────────────
                The river screen puts a 52pt photo where a 17pt glyph would go,
                so its rows change shape down the list as coverage comes and
                goes. Coverage is partial by nature and this list is long, so
                the frame is fixed here and only its CONTENTS vary. A row
                without a photo is plain; it is not a different row.

                Through placeSymbol with a synthetic `access` layer, which is
                what the map screen's own search results do — so a campground
                picked as a put-in draws the tent it draws everywhere else,
                from one derivation rather than a second guess at the call
                site.

                The padlock that used to stand in for a private point is gone
                and is not coming back here: swapping the mark made permission
                look like a different KIND of place rather than a condition on
                this one. "Private" is on the meta line below, which is where a
                caveat belongs — in words, not a glyph that has to be
                decoded. */}
            <View style={[styles.optionWell, { backgroundColor: colors.cardRaised }]}>
              {point.imageUrls?.[0] ? (
                <Image
                  source={{ uri: point.imageUrls[0] }}
                  style={styles.optionPhoto}
                  // Required by RN's a11y lint: a photograph must not be
                  // colour-inverted by Smart Invert, unlike UI chrome.
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <EddySymbol name={placeSymbol({ layer: 'access' }, point)} size={22} />
              )}
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionName, { color: colors.text }]} numberOfLines={1}>
                {point.name}
              </Text>
              <Text style={[styles.optionMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {[
                  accessTypeLabel(point.type),
                  `Mile ${point.riverMile.toFixed(1)}`,
                  point.isPublic ? null : 'Private',
                  // The number that actually decides a take-out. Reading it off
                  // two river miles in your head is exactly the arithmetic an
                  // app should be doing for you.
                  miles != null ? `${miles.toFixed(1)} mi float` : null,
                  // Straight-line, and labelled "away" rather than "drive" for
                  // exactly that reason — an Ozark put-in eight miles off can be
                  // forty minutes of gravel road.
                  away != null ? `${away < 10 ? away.toFixed(1) : away.toFixed(0)} mi away` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {selected ? <Ionicons name="checkmark" size={18} color={colors.interactive} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  headText: { flex: 1 },
  title: { ...t['2xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  breadcrumb: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    // Top padding it never had. The row sat directly against the sheet's title
    // block, so the three pills read as attached to "Plan a float" rather than
    // as the step control under it.
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    // Tighter between the pills now that each one is wider inside. The row is
    // three equal thirds either way; what changed is where the space went —
    // into the pills, where it separates the mark from the place name, rather
    // than into the gaps, where it only separated the pills from each other.
    gap: 8,
  },
  crumb: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    // 8 was not enough for a bordered pill: the mark sat on the left edge and a
    // truncated place name ran into the right one, so the whole control read as
    // text that happened to have a line drawn round it.
    paddingHorizontal: 12,
    paddingVertical: 7,
    // 34 rather than 30, which is what the vertical padding above lands on for
    // a single line of 13pt — stated as a floor so a pill holding a mark and no
    // text cannot come out shorter than its neighbours.
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
  },
  // The label is gone as a separate line: an answered crumb says "Akers", and
  // an unanswered one says "Put-in". Printing both stacked was the thing that
  // forced 12pt and two rows of height on a control with three columns.
  crumbValue: { ...t.sm, fontFamily: fonts.medium },
  list: { padding: 16, gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 12 },
  // Fixed, so the row keeps one height whether or not the point has a photo.
  // The radius is the card's own, one step in — a thumbnail nested inside a
  // rounded row reads wrong with square corners or with the same radius.
  optionWell: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  optionPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  optionBody: { flex: 1, minWidth: 0 },
  optionName: { ...t.sm, fontFamily: fonts.semibold },
  optionMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  pickerIntro: { ...t.sm, fontFamily: fonts.body, marginBottom: 4 },
  riverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  conditionDot: { width: 8, height: 8, borderRadius: 4 },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 4,
  },
  sortText: { ...t.xs, fontFamily: fonts.semibold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  calculating: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  errorText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  link: { ...t.sm, fontFamily: fonts.semibold },
  actions: { gap: 10, marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 10 },
  // Both flex:1, so the two intentions carry the same weight. Share keeps the
  // accent — it is still the thing most people do with a finished plan — and
  // Save is outlined until it is on, when it wears the star's own warm edge.
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  saveButtonText: { ...t.base, fontFamily: fonts.heading },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: { ...t.base, fontFamily: fonts.heading },
  actionError: { ...t.xs, fontFamily: fonts.body, textAlign: 'center' },
  secondaryButton: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  secondaryButtonText: { ...t.sm, fontFamily: fonts.semibold },
});
