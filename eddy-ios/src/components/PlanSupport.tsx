// eddy-ios/src/components/PlanSupport.tsx
// Who can help with this float, at whichever end of it they are near.
//
// Replaces PlanNearby, which ranked every shuttle on the river by distance from
// the put-in and showed the closest three. That answered "who shuttles here"
// well and "who shuttles THIS float" poorly: the two ends of a float are often
// forty minutes apart, and an outfitter beside the take-out was invisible to a
// list sorted from the put-in. The rules are in lib/planSupport.ts; the request
// choreography is in lib/loadPlanSupport.ts. This file is the rendering.
//
// ── Fetched here, not passed in ─────────────────────────────────────────────
// Inherited from PlanNearby and still right: this works identically in the
// planning sheet and on the screen that opens a shared float, and the second of
// those has a plan and no other river data at all. Three small cached calls per
// river, and a failure is silence — a plan with no outfitter list is still a
// plan.
//
// ── Phone first ─────────────────────────────────────────────────────────────
// Same rule the map callout follows: at a put-in on one bar, a number you can
// tap beats a website you have to load. A row with neither gets no buttons
// rather than a button that does nothing.

import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan, NearbyService } from '@eddy/types';
import { fetchAccessPointDetail, fetchRiverServices } from '@/api/client';
import { serviceTypeLabel } from '@/map/serviceLayers';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { milesBetween } from '@/hooks/useLocation';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { emptyPlanSupport, loadPlanSupport, type PlanSupportData } from '@/lib/loadPlanSupport';
import { serviceContactUrl } from '@/lib/planSupport';

export function PlanSupport({ plan }: { plan: FloatPlan }) {
  const { colors, elevation } = useTheme();

  // ── ONE STATE OBJECT, KEYED BY THE PLAN IT DESCRIBES ────────────────────
  // Not two useStates. The endpoints change while a request is in flight —
  // picking a different take-out is one tap — and a late response setting data
  // alone would show the previous float's outfitters under the current float's
  // headings, with nothing on screen admitting it. Holding the key beside the
  // payload makes a stale write unrenderable rather than merely unlikely; the
  // abort below makes it rare. useAccessPointDetail solves the same problem the
  // same way, for the same reason.
  const planKey = `${plan.river?.slug ?? ''}:${plan.putIn?.id ?? ''}:${plan.takeOut?.id ?? ''}`;
  const [state, setState] = useState<{ key: string; data: PlanSupportData }>({
    key: planKey,
    data: emptyPlanSupport(),
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void loadPlanSupport(plan, {
      fetchDetail: fetchAccessPointDetail,
      fetchServices: fetchRiverServices,
      distance: milesBetween,
      signal: controller.signal,
    }).then((data) => {
      if (!cancelled) setState({ key: planKey, data });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `plan` is excluded deliberately: it is a fresh object every render, and
    // planKey is the identity that actually decides whether a refetch is owed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const { groups, nearest } = state.key === planKey ? state.data : emptyPlanSupport();

  const putInRows = [...groups.putIn.rentals, ...groups.putIn.camping];
  const takeOutRows = [...groups.takeOut.rentals, ...groups.takeOut.camping];
  if (!putInRows.length && !takeOutRows.length && !nearest.length) return null;

  const serviceRow = (service: NearbyService, symbol: EddySymbolName) => {
    const url = serviceContactUrl(service);
    const meta = [service.distance, service.notes].filter(Boolean).join(' · ');
    return (
      <Row
        key={`${service.name}-${service.type}`}
        name={service.name}
        meta={meta || null}
        symbol={symbol}
        phone={service.phone ?? null}
        // One action, because an embedded entry carries at most one useful
        // route out — serviceContactUrl has already picked the phone over the
        // website. The directory rows below can offer both because they hold
        // both.
        url={url}
        colors={colors}
        elevation={elevation}
      />
    );
  };

  return (
    <View style={styles.wrap}>
      {putInRows.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Near the put-in</Text>
          {groups.putIn.rentals.map((s) => serviceRow(s, 'outfitter'))}
          {groups.putIn.camping.map((s) => serviceRow(s, 'campground'))}
        </View>
      ) : null}

      {takeOutRows.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Near the take-out</Text>
          {groups.takeOut.rentals.map((s) => serviceRow(s, 'outfitter'))}
          {groups.takeOut.camping.map((s) => serviceRow(s, 'campground'))}
        </View>
      ) : null}

      {/* ── WHAT THE ASSOCIATIONS MISSED ──────────────────────────────────
          Ranked by straight-line distance from the put-in, and headed so that
          it does not compete with the two above: those are businesses somebody
          decided serve this landing, these are the nearest ones nobody has said
          that about. Providers already shown above are excluded outright — see
          loadPlanSupport — so a reader never meets one business twice, once as
          an association and once as a mileage. */}
      {nearest.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {putInRows.length || takeOutRows.length
              ? 'Other shuttles nearby'
              : 'Shuttles near the put-in'}
          </Text>
          {nearest.map(({ service, miles }) => (
            <Row
              key={service.id}
              name={service.name}
              meta={[
                serviceTypeLabel(service),
                // Straight-line, and said so: an outfitter four miles off can
                // be twenty minutes of gravel.
                `${miles < 10 ? miles.toFixed(1) : miles.toFixed(0)} mi away`,
              ].join(' · ')}
              symbol="outfitter"
              phone={service.phone}
              website={service.website}
              colors={colors}
              elevation={elevation}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One service, however it reached this strip.
 *
 * Takes `phone`/`website` separately for the directory rows, which hold both
 * and deserve two buttons, and a resolved `url` for the embedded entries, which
 * hold at most one useful route out. Shared so an outfitter looks the same
 * whether Eddy knows it as an association or found it by distance.
 */
function Row({
  name,
  meta,
  symbol,
  phone,
  website,
  url,
  colors,
  elevation,
}: {
  name: string;
  meta: string | null;
  symbol: EddySymbolName;
  phone?: string | null;
  website?: string | null;
  url?: string | null;
  colors: ReturnType<typeof useTheme>['colors'];
  elevation: ReturnType<typeof useTheme>['elevation'];
}) {
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
  const site = website
    ? /^https?:\/\//i.test(website)
      ? website
      : `https://${website}`
    : null;
  // The single-action form, for rows that came with one route out.
  const only = !tel && !site && url ? url : null;

  return (
    <View style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={[styles.iconWell, { backgroundColor: colors.cardRaised }]}>
        <EddySymbol name={symbol} size={17} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        {meta ? (
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {tel ? (
          <Action
            icon="call-outline"
            label={`Call ${name}`}
            onPress={() => void Linking.openURL(tel)}
            colors={colors}
          />
        ) : null}
        {site ? (
          <Action
            icon="globe-outline"
            label={`${name} website`}
            onPress={() => void Linking.openURL(site)}
            colors={colors}
          />
        ) : null}
        {only ? (
          <Action
            icon={only.startsWith('tel:') ? 'call-outline' : 'globe-outline'}
            label={only.startsWith('tel:') ? `Call ${name}` : `${name} website`}
            onPress={() => void Linking.openURL(only)}
            colors={colors}
          />
        ) : null}
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={15} color={colors.interactive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 10 },
  section: { marginBottom: 6 },
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
