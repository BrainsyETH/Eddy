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
import { campsiteAvailabilityLine } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { MapPin } from '@/map/RiverMap';
import { useAccessPointDetail } from '@/hooks/useAccessPointDetail';
import { useGaugeDetail } from '@/hooks/useGaugeDetail';
import { MapSheet, type SheetMetrics } from './MapSheet';
import { PinCallout } from './PinCallout';
import { PlaceHead } from './PlaceHead';
import { AccessGaugeReading, AccessTypeBadges } from './sections';
import { SheetTabBar } from './SheetTabBar';
import { SheetPager, mountedPages } from './SheetPager';
import { accessTabs, initialTabKey, type TabKey } from './tabs';
import type { Detent } from './sheetGeometry';
import { confirmPlanAction, isDriveable, openDirections } from './sheetActions';
import {
  AccessCampingTab,
  AccessConditionsTab,
  AccessDetailsTab,
  AccessFloatsTab,
  AccessOverviewTab,
} from './AccessTabs';
import {
  GaugeAboutTab,
  GaugeHistoryTab,
  GaugeLevelsTab,
  GaugeNowTab,
  GaugeRiversTab,
} from './GaugeSheet';
import { gaugeTabs, type GaugePinFacts, type GaugeTabKey } from './gaugeTabs';

export interface PinSheetProps {
  pin: MapPin;
  accessPoint: MapAccessPoint | null;
  canSetTakeOut: boolean;
  onSetPutIn: () => void;
  onSetTakeOut: () => void;
  onOpenRiver: (slug: string) => void;
  onOpenGauge: (siteId: string) => void;
  onOpenDam: (damId: string) => void;
  onOpenDetail: (route: string) => void;
  onClose: () => void;
  starred?: boolean;
  onToggleStar?: (() => void) | null;
  /** Build a float from here to a neighbouring access. */
  onPlanTo: (nearby: NearbyAccessPoint) => void;
  /** Ids of neighbouring accesses you can sleep at. See AccessTabs. */
  campableIds: Set<string>;
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
  const gaugeDetail = useGaugeDetail(isGaugePin ? pin.siteId : null);

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
      riverCount: gaugeDetail?.thresholds?.length ?? 0,
    };
  }, [isGaugePin, pin, gaugeDetail]);

  const gTabs = useMemo(() => (gaugeFacts ? gaugeTabs(gaugeFacts) : []), [gaugeFacts]);

  const tabs = useMemo(
    () => (accessPoint ? accessTabs(accessPoint, detail) : []),
    [accessPoint, detail],
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
  // it was before any of this existed. Gauges never reach it either — gaugeTabs
  // always yields Now and About — so this is the non-access, single-page sheet
  // and nothing else.
  if (!accessPoint && activeTabs.length <= 1) {
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
      campableIds: props.campableIds,
      status,
    };
    if (key === 'overview') return <AccessOverviewTab {...shared} />;
    if (key === 'conditions') return <AccessConditionsTab {...shared} />;
    if (key === 'floats') return <AccessFloatsTab {...shared} />;
    if (key === 'camping') return <AccessCampingTab {...shared} />;
    return <AccessDetailsTab {...shared} />;
  };

  const renderGaugeTab = (key: GaugeTabKey) => {
    if (!gaugeFacts) return null;
    const shared = {
      facts: gaugeFacts,
      detail: gaugeDetail,
      onOpenGauge: props.onOpenGauge,
      onOpenRiver: props.onOpenRiver,
    };
    if (key === 'now') return <GaugeNowTab {...shared} />;
    if (key === 'levels') return <GaugeLevelsTab {...shared} />;
    if (key === 'history') return <GaugeHistoryTab {...shared} />;
    if (key === 'rivers') return <GaugeRiversTab {...shared} />;
    return <GaugeAboutTab {...shared} />;
  };

  const renderTab = (key: string) =>
    accessPoint ? renderAccessTab(key as TabKey) : renderGaugeTab(key as GaugeTabKey);

  return (
    <MapSheet
      resetKey={pin.id}
      label={`${pin.name} sheet`}
      onClose={props.onClose}
      onDetentChange={props.onDetentChange}
      metrics={props.metrics}
      peek={<PinSheetHeader {...props} detail={detail} />}
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
  onClose,
  starred = false,
  onToggleStar = null,
  detail,
}: PinSheetProps & { detail: AccessPointDetailResponse | null }) {
  const { colors } = useTheme();
  const nps = detail?.accessPoint?.npsCampground ?? null;
  const availability = campsiteAvailabilityLine(nps?.availability, nps?.name ?? pin.name);

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
      <PlaceHead
        pin={pin}
        accessPoint={accessPoint}
        starred={starred}
        onToggleStar={onToggleStar}
        onClose={onClose}
      />

      {/* THE WATER, FIRST. This is the fact that decides whether anybody drives
          to a put-in, so it belongs directly under the name and above the
          action it qualifies — you would not tap "Use as put-in" without it.

          It reaches the glance from `detail.gaugeStatus`, the same response
          every tab is drawn from. It used to come from useAccessGaugeStatus,
          a second hook asking the SAME endpoint for this one field, mounted by
          the callout that the tabbed sheet replaced a moment later — so every
          tapped access point issued that request twice. One shell, one
          request. */}
      <AccessGaugeReading status={detail?.gaugeStatus} onOpenGauge={onOpenGauge} />

      {/* Then where you sleep. A sentence, and it goes stale over a weekend, so
          it belongs where it can be read without a gesture. Absent, never
          "unknown" — campsiteAvailabilityLine returns null when it should not
          appear. */}
      {availability ? (
        <Text style={[styles.availability, { color: colors.text }]} numberOfLines={2}>
          {availability}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {accessPoint ? (
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
  availability: { ...t.sm, fontFamily: fonts.medium, marginTop: 9 },
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
