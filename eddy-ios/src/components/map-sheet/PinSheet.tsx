// eddy-ios/src/components/map-sheet/PinSheet.tsx
// Picks what a tapped pin shows, and holds the tab state while it shows it.
//
// The dispatcher shape is borrowed from the website's RightRail, which does the
// same job for the surface-water map: one component that switches on what is
// selected, so no caller has to know that a gauge and a put-in are different
// kinds of card.
//
// ── Access points and gauges are tabbed; dams and hazards are not ─────────
// Dams, hazards and outfitters still render the single-page callout, unchanged
// and inside the same draggable shell. Their tab sets are real work of their
// own — a schedule-only dam has strictly less to say than one with a tailwater
// — and doing them here would have made this change about four types at once.
//
// ── THE SHELL IS CHOSEN BY WHAT WAS TAPPED, NOT BY HOW MUCH LANDED ────────
// It was chosen by tab count, and a tab count is not known on the first frame:
// an access point qualifies for Overview alone until its detail request lands,
// so every put-in opened as a callout and swapped its whole peek for the tabbed
// header a moment later. What the reader saw was the sheet resettling under
// their thumb for no reason they could name. A pin's TYPE is known the instant
// it is tapped, so that is what decides the shape; the tab bar is the only
// thing the late request is allowed to add.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import type {
  AccessPointDetailResponse,
  MapAccessPoint,
  NearbyAccessPoint,
} from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { MapPin } from '@/map/RiverMap';
import { useAccessPointDetail } from '@/hooks/useAccessPointDetail';
import { useGaugeDetail } from '@/hooks/useGaugeDetail';
import { CampgroundAvailability } from './CampgroundAvailability';
import { accessAvailability, accessAvailabilityName } from './availabilitySource';
import { localToday } from './availability';
import { decisionSlot, type DecisionSlot } from './peekSlot';
import { GlanceSlot } from './GlanceSlot';
import { MapSheet, type SheetMetrics } from './MapSheet';
import { PinCallout } from './PinCallout';
import { PlaceHead } from './PlaceHead';
import { AccessGaugeReading, AccessTypeBadges } from './sections';
import { SheetTabBar } from './SheetTabBar';
import { SheetPager, mountedPages } from './SheetPager';
import { accessTabs, initialTabKey, type TabKey } from './tabs';
import type { PlaceSymbolName } from './placeSymbol';
import type { DetailStatus } from '@/hooks/useAccessPointDetail';
import type { Detent } from './sheetGeometry';
import { confirmPlanAction, isDriveable, openDirections } from './sheetActions';
import { AccessCampingTab, AccessFloatsTab, AccessOverviewTab } from './AccessTabs';
import {
  GaugeAboutTab,
  GaugeHistoryTab,
  GaugeLevelsTab,
  GaugeReadingRow,
} from './GaugeSheet';
import { gaugeTabs, type GaugePinFacts, type GaugeTabKey } from './gaugeTabs';

export interface PinSheetProps {
  pin: MapPin;
  accessPoint: MapAccessPoint | null;
  canSetTakeOut: boolean;
  /**
   * Whether the river this pin sits on carries any gauge at all.
   *
   * Answered from the statewide network the map screen already holds, NOT from
   * the detail response — it decides whether the peek reserves room for a
   * reading, and a reservation made after the response has landed is the
   * movement the reservation exists to prevent. See peekSlot.ts.
   */
  riverHasGauges: boolean;
  onSetPutIn: () => void;
  onSetTakeOut: () => void;
  onOpenRiver: (slug: string) => void;
  onOpenGauge: (siteId: string) => void;
  onOpenDam: (damId: string) => void;
  onOpenDetail: (route: string) => void;
  /**
   * ── BOTH LAND ON WHAT WAS THERE BEFORE. ONE OF THEM SAYS SO ─────────────
   *
   * onClose: goes back to whatever the reader was looking at before this pin.
   * Usually that is the pin and nothing else — but a pin tap can SELECT a river
   * as a side effect, and a caller undoing this must undo that too or the
   * reader is left closing a sheet that only exists because of the tap they
   * just undid. The caller decides; see the map screen's `dismissPin`.
   *
   * What it must never do is destroy a river the READER chose. That case has a
   * Back control, and both land there.
   *
   * onBack: the same outcome, offered as a named 44pt target instead of a 19pt
   * glyph in a corner — "‹ Meramec River" says where it lands and × does not.
   * Null when nothing was underneath, which is not the same as "no river is
   * selected": a pin tap can select the river as a side effect, and then the
   * river sheet was never on screen to return to.
   */
  onBack?: (() => void) | null;
  /** The river Back returns to, so the control names its destination. */
  backLabel?: string | null;
  onClose: () => void;
  starred?: boolean;
  onToggleStar?: (() => void) | null;
  /** Build a float from here to a neighbouring access. */
  onPlanTo: (nearby: NearbyAccessPoint) => void;
  /** What each neighbouring access IS, as its mark. See AccessTabs. */
  nearbyMarks: Map<string, PlaceSymbolName>;
  /** How wide a tab page is — the sheet's width, measured by the caller. */
  width: number;
  /** Forwarded to MapSheet so the map can follow the sheet. */
  onDetentChange?: (detent: Detent, height: number) => void;
  /** Forwarded to MapSheet so the floating controls can follow it per frame. */
  metrics?: SharedValue<SheetMetrics>;
}

export function PinSheet(props: PinSheetProps) {
  const { pin, accessPoint, width } = props;
  // One request, every tab. See useAccessPointDetail.
  const { detail, status } = useAccessPointDetail(accessPoint ? pin.detailRoute : null);
  // Gauges of BOTH tiers. Null for anything else, so the hook no-ops on a pin
  // that is not a station rather than the call being made conditionally.
  const isGaugePin = pin.layer === 'gauges' || pin.layer === 'allGauges';
  const { detail: gaugeDetail, status: gaugeStatus } = useGaugeDetail(
    isGaugePin ? pin.siteId : null,
  );

  const gaugeFacts: GaugePinFacts | null = useMemo(() => {
    if (!isGaugePin) return null;
    return {
      siteId: pin.siteId ?? null,
      // The LAYER decides the tier, not the response: the pin is already drawn
      // and the sheet has to be honest about which vocabulary it is speaking
      // before the request lands.
      curated: pin.layer === 'gauges',
      reading: pin.value ?? null,
      code: pin.code ?? null,
      codeLabel: pin.codeLabel ?? null,
      updatedAt: pin.updatedAt ?? null,
      qualifierNote: null,
    };
    // gaugeDetail is deliberately NOT a dependency, and there is deliberately no
    // field here that would need it. Every fact is on the pin, so `gTabs` below
    // is settled on the first frame and the tab bar cannot rearrange itself
    // while the reader is using it. See gaugeTabs' header.
  }, [isGaugePin, pin]);

  const gTabs = useMemo(() => (gaugeFacts ? gaugeTabs(gaugeFacts) : []), [gaugeFacts]);

  const tabs = useMemo(
    () => (accessPoint ? accessTabs(accessPoint, detail) : []),
    [accessPoint, detail],
  );

  /**
   * Which fact the peek reserved — resolved ONCE, here, for two readers.
   *
   * The header draws it and Overview has to know what the header drew, so that
   * the sheet does not show the same gauge reading twice on a surface where the
   * peek and the page are on screen together. Computing it in both places would
   * be two derivations of one decision, which is precisely how the peek and the
   * tab would come to disagree — silently, and in the direction that loses a
   * campground pin its water reading.
   *
   * Detail-free by construction: `decisionSlot` takes no response, so this is
   * settled on the first frame and cannot change under the reader. That is the
   * whole mechanism, and peekSlot.ts's header explains why.
   */
  const slot = useMemo(
    () =>
      decisionSlot(
        {
          layer: pin.layer,
          hasAvailability: pin.availability != null || accessPoint?.hasLiveAvailability === true,
        },
        { riverHasGauges: props.riverHasGauges },
      ),
    [pin.layer, pin.availability, accessPoint?.hasLiveAvailability, props.riverHasGauges],
  );

  // ── Held BY KEY, never by index ─────────────────────────────────────────
  // The tab set grows while the sheet is open and the order is fixed, so a
  // late arrival inserts rather than appends: a campground pin opens on
  // [Overview, Camping] and settles as [Overview, Conditions, Floats, Camping,
  // Details], moving Camping from 1 to 3. An index would quietly hand the
  // reader a different tab; a key cannot.
  //
  // NULL MEANS "HAS NOT CHOSEN", which is a different state from "chose the
  // first tab" and has to be, or a tent pin would drag you back to Camping
  // every time you tapped Overview.
  const [chosen, setChosen] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const progress = useSharedValue(0);

  // Measured, because the header is two lines for some pins and four for
  // others and the tab bar comes and goes. What is left over is what a page
  // may fill before it has to scroll.
  const [chromeHeight, setChromeHeight] = useState(0);
  const onChromeLayout = useCallback(
    (event: LayoutChangeEvent) => setChromeHeight(Math.round(event.nativeEvent.layout.height)),
    [],
  );


  if (seededFor !== pin.id) {
    // Render-time seed rather than an effect: an effect would paint one frame
    // of the previous pin's tab first.
    setSeededFor(pin.id);
    setChosen(null);
  }

  // Whichever kind of thing was tapped. The shell, the bar and the pager are
  // the same either way — only the page bodies differ, which is the whole
  // reason the tab machinery knows nothing about pins.
  const activeTabs: { key: string; label: string }[] = accessPoint ? tabs : gTabs;

  // A chosen tab that no longer qualifies falls back to the pin's preference
  // rather than to wherever its index now points.
  const preferred = accessPoint ? initialTabKey(tabs, pin) : (gTabs[0]?.key ?? null);
  const activeKey =
    chosen && activeTabs.some((tab) => tab.key === chosen) ? chosen : preferred;
  const activeIndex = Math.max(0, activeTabs.findIndex((tab) => tab.key === activeKey));

  const isMounted = mountedPages(activeIndex, activeTabs.length);

  // ── AN ACCESS POINT NEVER TAKES THIS PATH ───────────────────────────────
  // It used to, for as long as Overview was its only qualifying tab — which is
  // every access point, for the few hundred milliseconds before the detail
  // request lands. So the sheet opened as a PinCallout and then, mid-glance,
  // swapped its entire peek for PinSheetHeader: a different component, a
  // different set of rows, a different measured height. MapSheet did exactly
  // what it promises in that situation and followed its own detent to the new
  // height over 180ms — which the reader sees as the sheet resettling under
  // their thumb, for having done nothing at all.
  //
  // Now the shell is decided by WHAT WAS TAPPED, which is known on the first
  // frame, rather than by how many tabs have qualified, which is not. The tab
  // bar is what appears when the request lands; the peek does not move.
  //
  // Everything else still lands here and should: a hazard, an outfitter, a dam
  // with nothing but a schedule. For those the callout IS the peek, exactly as
  // it was before any of this existed.
  //
  // ── `!isGaugePin` IS LOad-BEARING, and it is new ────────────────────────
  // This guard used to be safe on gauges by accident: gaugeTabs always returned
  // Now and About, so a station could never fall to one tab. Now is gone — the
  // glance is now — so a reference station with no site id qualifies for About
  // alone and would be routed here, swapping the whole peek for a callout a
  // moment after opening. That is precisely the shell swap the paragraph above
  // describes being fixed for access points, arriving by a different door.
  //
  // A gauge keeps the tabbed shell whatever its tab count, and the
  // `activeTabs.length > 1` check further down means a one-tab station simply
  // shows no bar.
  if (!accessPoint && !isGaugePin && activeTabs.length <= 1) {
    return (
      <MapSheet
        resetKey={pin.id}
        label={`${pin.name} sheet`}
        onClose={props.onClose}
        onDetentChange={props.onDetentChange}
        metrics={props.metrics}
        peek={<PinCallout {...props} />}
      />
    );
  }

  const renderAccessTab = (key: TabKey) => {
    // Narrowed here rather than at the early return: that guard now covers both
    // kinds of tab set, so it no longer proves this pin is an access point.
    if (!accessPoint) return null;
    const shared = {
      accessPoint,
      detail,
      onOpenGauge: props.onOpenGauge,
      // Null, not a closure that checks and does nothing — a tab decides
      // whether to draw the row from this, and it now draws it on pins whose
      // detail request has not landed. See TabProps.onOpenDetail.
      onOpenDetail: pin.detailRoute ? () => props.onOpenDetail(pin.detailRoute!) : null,
      onOpenRiver: props.onOpenRiver,
      onPlanTo: props.onPlanTo,
      nearbyMarks: props.nearbyMarks,
      status,
      // So Overview can decline to draw whatever the glance is already showing.
      peekSlot: slot,
      onOpenCamping: () => setChosen('camping'),
    };
    if (key === 'floats') return <AccessFloatsTab {...shared} />;
    // `active` gates the per-site request. SheetPager mounts the active page
    // and both neighbours, so Camping mounts alongside Floats on most pins —
    // firing on mount would request the sites of nearly every campground
    // somebody taps, which is the whole reason that request is separate.
    if (key === 'camping') {
      return <AccessCampingTab {...shared} active={activeKey === 'camping'} />;
    }
    // Overview is the fallback rather than an explicit branch: it is the one
    // key accessTabs always emits, so an unreachable `return null` below it
    // would be the only dead line in this dispatch.
    return <AccessOverviewTab {...shared} />;
  };

  const renderGaugeTab = (key: GaugeTabKey) => {
    if (!gaugeFacts) return null;
    const shared = {
      facts: gaugeFacts,
      detail: gaugeDetail,
      status: gaugeStatus,
      onOpenGauge: props.onOpenGauge,
      onOpenRiver: props.onOpenRiver,
    };
    if (key === 'levels') return <GaugeLevelsTab {...shared} />;
    if (key === 'history') return <GaugeHistoryTab {...shared} />;
    return <GaugeAboutTab {...shared} />;
  };

  const renderTab = (key: string) =>
    accessPoint ? renderAccessTab(key as TabKey) : renderGaugeTab(key as GaugeTabKey);

  return (
    <MapSheet
      resetKey={pin.id}
      label={`${pin.name} sheet`}
      // ── A DRAG DOWN UNDOES ONE LEVEL, NOT THE WHOLE STACK ───────────────
      // MapSheet's swipe-to-dismiss and its VoiceOver escape both land here.
      // Where a Back exists this selection is a drill-down from the river
      // sheet, and flinging it away should return there rather than clearing a
      // river the reader chose several taps ago — the gesture is the cheapest
      // control on the sheet and must therefore be the least destructive one.
      onClose={props.onBack ?? props.onClose}
      onDetentChange={props.onDetentChange}
      metrics={props.metrics}
      peek={
        <PinSheetHeader
          {...props}
          detail={detail}
          status={status}
          gaugeFacts={gaugeFacts}
          backLabel={props.backLabel}
          // The availability card is a shortcut to the tab that can be operated:
          // the peek's fortnight is a chart because fourteen columns are twenty
          // points each, and Camping draws the same nights as 44pt chips.
          onOpenCamping={() => setChosen('camping')}
          peekSlot={slot}
        />
      }
    >
      <View onLayout={onChromeLayout}>
        <PinSheetDetail pin={pin} accessPoint={accessPoint} />
        {/* ONE TAB IS NOT A TAB BAR. An access point holds this shape from the
            first frame, so for the moment before its detail lands there is a
            single page and nothing to choose between — and a bar with one
            entry is a control that cannot be operated.

            It appears rather than the layout changing around it: everything
            above is in the peek and does not move, and the pager below is
            already the right width for one page. Measured either way, because
            onChromeLayout wraps both and the page budget has to know. */}
        {activeTabs.length > 1 ? (
          <SheetTabBar
            labels={activeTabs.map((tab) => tab.label)}
            index={activeIndex}
            onSelect={(i) => setChosen(activeTabs[i]?.key ?? null)}
            progress={progress}
          />
        ) : null}
      </View>
      <SheetPager
        count={activeTabs.length}
        index={activeIndex}
        onIndexChange={(i) => setChosen(activeTabs[i]?.key ?? null)}
        progress={progress}
        width={width}
        pageKeys={activeTabs.map((tab) => tab.key)}
        chromeHeight={chromeHeight}
      >
        {activeTabs.map((tab, i) => (
          <View key={tab.key} style={styles.page}>
            {/* Neighbours only. A tab nobody has been near costs nothing, and
                one that has been visited keeps whatever it had. */}
            {isMounted(i) ? renderTab(tab.key) : null}
          </View>
        ))}
      </SheetPager>
    </MapSheet>
  );
}

/**
 * Who this is, and what to do about it — the part that is readable at a glance.
 *
 * Everything here comes from data the map ALREADY HOLDS, so it paints on the
 * first frame with no request outstanding. The two lines that arrive late are
 * the reading and the campsite availability, and both are absent until they do
 * rather than reserving space for themselves.
 */
function PinSheetHeader({
  pin,
  accessPoint,
  canSetTakeOut,
  onSetPutIn,
  onSetTakeOut,
  onOpenDetail,
  onOpenGauge,
  onBack = null,
  onClose,
  starred = false,
  onToggleStar = null,
  detail,
  status,
  gaugeFacts,
  onOpenCamping,
  peekSlot,
  backLabel,
}: PinSheetProps & {
  detail: AccessPointDetailResponse | null;
  status: DetailStatus;
  gaugeFacts: GaugePinFacts | null;
  onOpenCamping: () => void;
  /** Which fact the glance reserves. Resolved once by PinSheet — see there. */
  peekSlot: DecisionSlot;
  /** The river the Back control returns to, named so the row is not a bare "‹". */
  backLabel?: string | null;
}) {
  const { colors } = useTheme();
  const point = detail?.accessPoint ?? null;

  // ── The pin first, the response second ──────────────────────────────────
  // A campground drawn from nearby_services carries its availability ON THE PIN
  // (see the campgrounds layer in RiverMap), so for those the card fills on the
  // first frame and the reserved box is never seen. A campground that is also an
  // ACCESS POINT does not — MapAccessPoint has no availability field — so those
  // still wait for the response. Preferring the pin costs nothing and skips the
  // placeholder wherever it can.
  const availability = pin.availability ?? accessAvailability(point);
  const availabilityName = accessAvailabilityName(point, pin.name);

  // ── RESOLVED BY THE PARENT, not here ──────────────────────────────────
  // It used to be computed in this component, which was fine while the header
  // was its only reader. Overview now has to know what the glance drew, so the
  // one decision is made once in PinSheet and handed to both — see the memo
  // there. `riverHasGauges` is still a prop because the callout path uses it.
  const slot = peekSlot;
  // 'ready' means the question has been ANSWERED, not that the answer is
  // non-empty — a resolved-empty slot draws its terminal line rather than
  // waiting forever. 'idle' is a pin with no detail route, which is answered
  // too: nothing is coming.
  const detailSettled = status === 'ready' || status === 'failed' || status === 'idle';
  // Settled is not the same as answered. Both slots below draw a terminal line
  // when nothing arrived, and the line has to say which kind of nothing it is.
  const detailFailed = status === 'failed';

  const planAsTakeOut = canSetTakeOut;
  const performPlanAction = planAsTakeOut ? onSetTakeOut : onSetPutIn;
  const onPlanAction = () =>
    confirmPlanAction({
      accessPoint,
      detailRoute: pin.detailRoute,
      proceed: performPlanAction,
      onOpenDetail,
    });

  return (
    <View style={styles.header}>
      {/* ── BACK, and only when there is somewhere to go back TO ───────────
          Present only when a river sheet was genuinely on screen before this
          pin — which is NOT the same as a river being selected, because a pin
          tap can select the river itself. The caller records that at selection
          time; see revealsRiverSheet on the Map tab.

          A 44pt LAID-OUT target, not a 24pt row that looks like one. The
          compact look is a styling choice and the target is not: this sheet
          already carries a documented wrong-action bug from two controls that
          were the right size only with hitSlop (PlaceHead's header). The
          negative bottom margin recovers the spacing so the row still READS as
          light — the same trick as PlaceHead's EDGE_BLEED — and it is negative
          on the bottom rather than overlapping PlaceHead below, because iOS
          hit-tests later siblings first and an overlap would be silently eaten
          by the identity row. */}
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={backLabel ? `Back to ${backLabel}` : 'Back'}
        >
          <Ionicons name="chevron-back" size={16} color={colors.interactive} />
          <Text style={[styles.backText, { color: colors.interactive }]} numberOfLines={1}>
            {backLabel ?? 'Back'}
          </Text>
        </Pressable>
      ) : null}

      <PlaceHead
        pin={pin}
        accessPoint={accessPoint}
        starred={starred}
        onToggleStar={onToggleStar}
        onClose={onClose}
      />

      {/* ── ONE DECISION FACT, IN A BOX THAT DOES NOT MOVE ─────────────────
          This used to be two stacked blocks — the water, then the campsite
          availability — each of them absent until the detail request landed and
          each of them then inserting itself above the action row. On a
          campground that is also a put-in BOTH appeared, so the peek grew twice
          and MapSheet followed its own detent to the new height each time. What
          the reader saw was the sheet resettling under their thumb, twice, for
          having done nothing.

          Now `decisionSlot` picks ONE fact from the layer that was tapped and
          from whether the river has a gauge at all — both known on the first
          frame — and GlanceSlot holds its height from that frame whether or not
          anything has arrived. The tent's fortnight and the put-in's reading are
          each still one swipe away on Camping and Overview.

          It never collapses either: a slot whose request resolves empty says so
          rather than vanishing. See peekSlot.ts for why that is worth an
          exception to absent-never-empty. */}
      {slot === 'water' ? (
        <GlanceSlot slot={slot} ready={detailSettled}>
          {/* Three states, ONE component, so the box cannot change size between
              them: a chip-shaped placeholder, the reading, or — when the request
              settled with nothing — the terminal line. */}
          {!detailSettled ? (
            <AccessGaugeReading status={null} onOpenGauge={onOpenGauge} compact pending />
          ) : detail?.gaugeStatus ? (
            <AccessGaugeReading status={detail.gaugeStatus} onOpenGauge={onOpenGauge} compact />
          ) : (
            <AccessGaugeReading
              status={null}
              onOpenGauge={onOpenGauge}
              compact
              pending
              // ── A FAILED REQUEST IS NOT A FACT ABOUT THE RIVER ──────────
              // "No gauge grades this stretch" is a claim about Eddy's data and
              // may only be made from Eddy's data. The request that failed
              // never said anything, and reporting silence as an answer is the
              // same mistake the Levels tab was making one sheet over — there
              // it told a station wearing its own verdict that it had never
              // been rated. Same height either way, so the slot is unaffected.
              pendingLabel={
                detailFailed ? 'Conditions unavailable right now' : 'No gauge grades this stretch'
              }
            />
          )}
        </GlanceSlot>
      ) : slot === 'availability' ? (
        <GlanceSlot slot={slot} ready={availability != null || detailSettled}>
          {availability ? (
            // `water` is the corner reading the Overview Water section used to
            // carry: a campground pin's glance slot went to the fortnight, so
            // this card is the one place its river can still be glanced. Null
            // until the detail lands, and the corner sits inside a row whose
            // height it cannot change — see CampgroundAvailability.
            <CampgroundAvailability
              availability={availability}
              name={availabilityName}
              today={localToday()}
              onPress={onOpenCamping}
              water={detail?.gaugeStatus ?? null}
            />
          ) : (
            // Both the waiting and the settled-empty states are the card with
            // nothing in it — same shape, so no movement either way in. The
            // corner reading still draws on the settled-empty card: a
            // campground Eddy cannot book is still on a river somebody floats.
            <CampgroundAvailability
              availability={null}
              name={availabilityName}
              today={localToday()}
              pending
              // Told apart by WHY, like the reading above it: a request that
              // failed has not established that this campground takes no
              // bookings, and a reader who is told it has stops looking.
              pendingLabel={
                detailFailed
                  ? 'Campsites unavailable right now'
                  : detailSettled
                    ? 'No live availability here'
                    : undefined
              }
              water={detail?.gaugeStatus ?? null}
            />
          )}
        </GlanceSlot>
      ) : gaugeFacts ? (
        // A gauge needs no reservation: every word of this row is on the pin
        // before the sheet opens. See GaugeReadingRow.
        <GaugeReadingRow facts={gaugeFacts} compact />
      ) : null}

      <View style={styles.actions}>
        {/* Offered only where a float can actually start or end. `useFloatPlan`
            refuses a non-endpoint, and a button that silently refuses is worse
            than no button: it closes the sheet and opens an empty planner, so
            the reader learns nothing except that Eddy is broken.
            `!== false` keeps a payload predating the field behaving as before. */}
        {accessPoint && accessPoint.isFloatEndpoint !== false ? (
          <Pressable
            onPress={onPlanAction}
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
                borderColor: pressed ? colors.accentFillPressed : colors.accentFill,
              },
            ]}
            accessibilityRole="button"
            accessibilityHint={
              accessPoint.isPublic ? undefined : 'Private access confirmation required'
            }
          >
            <Ionicons name="flag-outline" size={15} color={colors.onAccent} />
            <Text style={[styles.primaryText, { color: colors.onAccent }]} numberOfLines={1}>
              {planAsTakeOut ? 'Use as take-out' : 'Use as put-in'}
            </Text>
          </Pressable>
        ) : null}
        {isDriveable(pin) ? (
          <Pressable
            onPress={() => openDirections(pin)}
            style={({ pressed }) => [
              styles.primary,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Directions to ${pin.name}`}
          >
            <Ionicons name="navigate-outline" size={15} color={colors.text} />
            <Text style={[styles.primaryText, { color: colors.text }]} numberOfLines={1}>
              Directions
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Everything the glance deliberately leaves out.
 *
 * Chips, the private notice and the type detail are all true and none of them
 * decide whether you keep looking. They begin at the half detent, which is what
 * gives the drag something to reveal.
 */
function PinSheetDetail({
  pin,
  accessPoint,
}: Pick<PinSheetProps, 'pin' | 'accessPoint'>) {
  const { colors } = useTheme();
  void pin;
  return (
    <View style={styles.header}>
      {/* The tent among them is the point: whether a put-in is also somewhere
          you can sleep is worth knowing once the sheet is open.

          THE ONLY PLACE THE TABBED SHEET SAYS THIS. Overview drew the same row
          again from its own copy of the component, nine points below this one and
          visible at the same time — the same six types, the same fee, plus a
          "Private" pill duplicating the notice underneath. See AccessTabs. */}
      {accessPoint ? <AccessTypeBadges accessPoint={accessPoint} /> : null}

      {accessPoint && !accessPoint.isPublic ? (
        <View style={[styles.private, { backgroundColor: colors.cardRaised }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.privateText, { color: colors.textMuted }]}>
            Private access — permission may be required
          </Text>
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16 },
  // 44 laid out, ~34 spent. See the call site for why the target is real and
  // why the margin is negative on the bottom rather than the top.
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    marginBottom: -10,
    marginLeft: -4,
  },
  backText: { ...t.sm, fontFamily: fonts.medium, flexShrink: 1 },
  private: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    marginTop: 9,
  },
  privateText: { ...t.sm, fontFamily: fonts.medium, flex: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    // The 44pt touch floor from DESIGN.md §6, same as the callout's row.
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
  },
  primaryText: { ...t.sm, fontFamily: fonts.semibold },
  page: { paddingHorizontal: 16 },
});
