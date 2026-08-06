// eddy-ios/src/components/map-sheet/PinSheet.tsx
// Picks what a tapped pin shows, and holds the tab state while it shows it.
//
// The dispatcher shape is borrowed from the website's RightRail, which does the
// same job for the surface-water map: one component that switches on what is
// selected, so no caller has to know that a gauge and a put-in are different
// kinds of card.
//
// ── Only access points are tabbed, for now ────────────────────────────────
// Gauges, dams, hazards and outfitters still render the single-page callout,
// unchanged and inside the same draggable shell. Their tab sets are real work
// of their own — a curated gauge and a national one must not share a
// vocabulary, and a schedule-only dam has strictly less to say than one with a
// tailwater — and doing them here would have made this change about four types
// at once. An access point with only one qualifying tab also lands here, which
// is what stops a tab bar appearing over a single page.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSharedValue } from 'react-native-reanimated';
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
import { AvailabilityGlance } from './AvailabilityGlance';
import { accessAvailability } from './availabilitySource';
import { localToday } from './availability';
import { MapSheet } from './MapSheet';
import { PinCallout } from './PinCallout';
import { PlaceHead } from './PlaceHead';
import { AccessTypeBadges } from './sections';
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

  // One tab is not a tab bar. Hazards and outfitters land here always; so does
  // an access point or a station that has not qualified for a second tab yet.
  if (activeTabs.length <= 1) {
    // All glance. The callout IS the peek, which is exactly how a hazard or an
    // outfitter behaved before any of this existed.
    return (
      <MapSheet
        resetKey={pin.id}
        onClose={props.onClose}
        onDetentChange={props.onDetentChange}
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
      onOpenDetail: () => pin.detailRoute && props.onOpenDetail(pin.detailRoute),
      onOpenRiver: props.onOpenRiver,
      onPlanTo: props.onPlanTo,
      campableIds: props.campableIds,
      status,
    };
    if (key === 'overview') return <AccessOverviewTab {...shared} />;
    if (key === 'conditions') return <AccessConditionsTab {...shared} />;
    if (key === 'floats') return <AccessFloatsTab {...shared} />;
    // `active` gates the per-site request. SheetPager mounts the active page
    // and both neighbours, so Camping mounts alongside Floats on most pins —
    // firing on mount would request the sites of nearly every campground
    // somebody taps, which is the whole reason that request is separate.
    if (key === 'camping') {
      return <AccessCampingTab {...shared} active={activeKey === 'camping'} />;
    }
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
      onClose={props.onClose}
      onDetentChange={props.onDetentChange}
      peek={<PinSheetHeader {...props} detail={detail} />}
    >
      <View onLayout={onChromeLayout}>
        <PinSheetDetail pin={pin} accessPoint={accessPoint} />
        <SheetTabBar
          labels={activeTabs.map((tab) => tab.label)}
          index={activeIndex}
          onSelect={(i) => setChosen(activeTabs[i]?.key ?? null)}
          progress={progress}
        />
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
  onClose,
  starred = false,
  onToggleStar = null,
  detail,
}: PinSheetProps & { detail: AccessPointDetailResponse | null }) {
  const { colors } = useTheme();
  const point = detail?.accessPoint ?? null;
  const availability = accessAvailability(point);

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

      {/* THE ONE FACT THAT DECIDES WHETHER YOU CARE, at the size that says so.
          It goes stale over a weekend, so it belongs where it can be read
          without a gesture — and the fortnight underneath is what answers
          "tonight?" and "the weekend after?" without one either. Absent, never
          "unknown": AvailabilityGlance renders nothing when it should not
          appear, which is the common case. */}
      <AvailabilityGlance
        availability={availability}
        name={point?.npsCampground?.name ?? pin.name}
        today={localToday()}
      />

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
