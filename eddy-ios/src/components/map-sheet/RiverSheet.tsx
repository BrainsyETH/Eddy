// eddy-ios/src/components/map-sheet/RiverSheet.tsx
// What a river says when you tap its line.
//
// ── This is net-new behaviour ─────────────────────────────────────────────
// Tapping a river used to produce no UI at all. onSelectNetworkRiver set the
// slug, CLOSED whatever callout was open, and cleared the focus so the map
// could re-frame — and the only thing that appeared was a header chip whose
// single action was to leave the screen. The map could choose a river and then
// had nothing to say about one.
//
// ── Every tab is built from memory ────────────────────────────────────────
// No request is made here. The statewide network already carries each river's
// gauges with their ladders, and the map screen already holds every access
// point and hazard it draws. Tapping a river is the cheapest interaction on
// this screen and it should stay that way — it is how you browse.
//
// ── Services are grouped, not re-classified ───────────────────────────────
// The sections come from serviceSections in riverTabs.ts, which asks the shared
// serviceTiers predicate in @eddy/types. This file draws rows; it does not hold
// an opinion about what an outfitter is. Six surfaces once held six of those
// opinions and they disagreed — see MAPS_SHEET_SERVICE_MODEL_PLAN.md.
import { useMemo } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MapAccessPoint } from '@eddy/types';
import type { RiverSheetData } from './riverTabs';
import { serviceSections } from './riverTabs';
import { serviceContactUrl } from '@/lib/planSupport';
import { criticalHazards, hazardTypeLabel, portageNote, severityLabel, sortHazards } from '@eddy/hazards';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { conditionBg, conditionChipBorder, conditionInk, conditionLabel } from '@/theme/conditions';
import { Absent, Fact, LinkRow, Prose, Section } from './sections';
import { RiverHead } from './RiverHead';
import { EddySymbol } from '../EddySymbol';
import { placeSymbol } from './placeSymbol';
import { accessAmenityLabel, drawableAmenities } from './accessAmenities';

// The registry and its shapes live in riverTabs.ts, which imports no React
// Native at all so the web suite can load it. Re-exported here so callers that
// want the tabs and the bodies together need only one import.
export type { RiverGaugeRow, RiverSheetData, RiverTabKey } from './riverTabs';
export { riverTabs } from './riverTabs';

export interface RiverTabProps {
  river: RiverSheetData;
  onOpenGauge: (siteId: string) => void;
  /** Select the pin on the map. Still the fallback for a point with no slug. */
  onSelectAccess: (point: MapAccessPoint) => void;
  /**
   * Push the access point's own screen.
   *
   * Separate from onSelectAccess because they are different destinations with
   * different costs: one moves the map, the other leaves it. The map screen owns
   * the route so this file never spells it — see RiverAccessesTab.
   */
  onOpenAccess: (point: MapAccessPoint) => void;
  onOpenRiver: (slug: string) => void;
}

/* ── Conditions ─────────────────────────────────────────────────────────── */

/**
 * ── THIS TAB ONLY EXISTS ON A RIVER WITH MORE THAN ONE GAUGE ──────────────
 *
 * riverTabs gates it, because the glance now carries the river's verdict and its
 * primary station's reading. What is left for a page to add is the DISAGREEMENT
 * between stations — which is a real thing on a long river and is exactly what
 * one row cannot show.
 *
 * ── The headline that used to be here was false ───────────────────────────
 *
 * It called `floatableHeadline(river.gauges.map(g => g.code))`. That helper
 * counts a LIST OF RIVERS and says so in words, so three gauges on one river
 * with two floatable rendered "2 of 3 rivers are floatable right now" — on a
 * sheet whose heading is a single river's name. The comment above it claimed
 * this kept the map and the Today list from disagreeing about the same water;
 * in fact it made the map state something about a set of rivers that did not
 * exist. Removed rather than reworded: the river's own verdict is in the glance,
 * where it is drawn from the river's own condition code.
 */
export function RiverConditionsTab({ river, onOpenGauge }: RiverTabProps) {
  const { colors } = useTheme();

  if (!river.gauges.length) {
    return <Absent>No gauge grades this river yet, so Eddy has no reading for it.</Absent>;
  }

  return (
    <View>
      <Section title="Gauges">
        {river.gauges.map((gauge) => (
          <Pressable
            key={gauge.siteId}
            onPress={() => onOpenGauge(gauge.siteId)}
            style={({ pressed }) => [styles.gaugeRow, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${gauge.name}, ${conditionLabel(gauge.code)}. Open the gauge`}
          >
            <View style={styles.gaugeText}>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                {gauge.name}
              </Text>
              {gauge.reading ? (
                <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {gauge.reading}
                  {gauge.isPrimary && river.gauges.length > 1 ? ' · primary' : ''}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: conditionBg(gauge.code),
                  borderColor: conditionChipBorder(gauge.code),
                },
              ]}
            >
              <Text style={[styles.chipText, { color: conditionInk(gauge.code) }]}>
                {conditionLabel(gauge.code)}
              </Text>
            </View>
          </Pressable>
        ))}
      </Section>
    </View>
  );
}

/* ── Camping & outfitters ───────────────────────────────────────────────── */

/**
 * Where to sleep and who rents boats, on this river.
 *
 * ── A ROW MAY APPEAR TWICE, AND THAT IS THE MODEL WORKING ─────────────────
 * `serviceTiers` is a SET. An outfitter that also rents cabins is in Rentals and
 * in Cabins, because it genuinely answers both questions, and 42% of the
 * directory is in that position. This is a list, not a map: the duplicate-pin
 * problem that makes the lodging LAYER drop what the rentals layer draws does
 * not exist here, so no de-duplication is applied and none should be.
 *
 * ── The detail line is a phone number where there is one ──────────────────
 * A service you cannot contact is a name. Phone first, then the town, which is
 * what tells you whether "Riverside Canoe" is the one twenty miles upstream.
 */
export function RiverServicesTab({ river }: RiverTabProps) {
  const sections = useMemo(() => serviceSections(river.services), [river.services]);

  // Unreachable through the tab bar — riverTabs qualifies this tab on exactly
  // this call — but the component is exported and must not render a bare gap if
  // it is ever mounted directly.
  if (!sections.length) {
    return <Absent>Eddy lists no campgrounds or outfitters on this river yet.</Absent>;
  }

  return (
    <View>
      {sections.map((section) => (
        <Section key={section.tier} title={section.title}>
          {section.rows.map((service) => {
            // One contact rule for a directory row and an embedded entry alike
            // — see serviceContactUrl. A row with neither phone nor site gets no
            // action rather than an action that does nothing.
            const url = serviceContactUrl(service);
            return (
              <LinkRow
                key={service.id}
                label={service.name}
                detail={service.phone ?? service.city ?? null}
                external={url != null}
                // Undefined, not a handler that checks and does nothing: that
                // is what makes the row stop being a button rather than become
                // a broken one. See LinkRow's onPress.
                onPress={url ? () => void Linking.openURL(url) : undefined}
              />
            );
          })}
        </Section>
      ))}
    </View>
  );
}

/* ── Accesses ───────────────────────────────────────────────────────────── */

/**
 * Every put-in on the river, as something you can actually judge.
 *
 * ── IT OPENS THE DETAILS SCREEN NOW, NOT THE PIN ──────────────────────────
 * This used to call onSelectAccess, which re-selected the pin and swapped this
 * sheet for that one — "a way of walking down the river without leaving the
 * map". The argument was reasonable and the behaviour was not what a list row
 * promises: you tap a named place in a list to LEARN ABOUT IT, and what arrived
 * was the same glance you already had, one river-sheet deeper, with the list you
 * were reading gone. Walking the river is what the map itself is for, and the
 * pins are still right there.
 *
 * The route is the one mapAccessPointPin builds — `/river/{slug}/access/{slug}`
 * — and it is spelled once, at the call site the map screen passes in, so the
 * two cannot drift. A point with no slug has no route, so it keeps the old
 * select-the-pin behaviour rather than becoming a dead row.
 *
 * ── A photo and the marks, because three lines of text was not enough ─────
 * `imageUrls` and `amenities` have been on this payload since the imagery
 * backfill and this tab read neither, so the app listed put-ins as name-and-mile
 * while the website showed what each one looks like. Which is the difference
 * between a name and knowing whether a trailer fits down there.
 */
export function RiverAccessesTab({ river, onSelectAccess, onOpenAccess }: RiverTabProps) {
  const { colors } = useTheme();
  const ordered = useMemo(
    () => [...river.accesses].sort((a, b) => a.riverMile - b.riverMile),
    [river.accesses],
  );

  return (
    <Section>
      {ordered.map((point) => {
        const marks = drawableAmenities(point.amenities);
        const spoken = accessAmenityLabel(point.amenities);
        const photo = point.imageUrls?.[0] ?? null;
        const symbol = placeSymbol({ layer: 'access' }, point);
        return (
          <Pressable
            key={point.id}
            onPress={() => (point.slug ? onOpenAccess(point) : onSelectAccess(point))}
            style={({ pressed }) => [styles.accessRow, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={[
              point.name,
              `mile ${point.riverMile.toFixed(1)}`,
              point.isPublic ? null : 'private',
              spoken,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            {/* The catalog mark when there is no photograph, never a grey box.
                Coverage is partial and always will be, so the no-photo layout
                has to be a choice rather than an apology — the same split
                PlaceHead makes, at the same 44pt, so a place looks the same here
                as it does when you tap it. */}
            <View style={[styles.thumb, { backgroundColor: colors.cardRaised }]}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.thumbImage} accessibilityIgnoresInvertColors />
              ) : (
                <EddySymbol name={symbol} size={24} />
              )}
            </View>

            <View style={styles.gaugeText}>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                {point.name}
              </Text>
              <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                Mile {point.riverMile.toFixed(1)}
                {point.isPublic ? '' : ' · private'}
              </Text>
              {/* Marks only, and the row is already spoken in full above — so
                  this is decoration to VoiceOver and a glance to everyone else.
                  Undrawable amenities are deliberately not shown as words here:
                  the row has one line of space and the details screen has the
                  whole list. */}
              {marks.length ? (
                <View style={styles.marks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {marks.map((mark) => (
                    <EddySymbol key={mark.slug} name={mark.symbol} size={15} />
                  ))}
                </View>
              ) : null}
            </View>

            <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
          </Pressable>
        );
      })}
    </Section>
  );
}

/* ── Hazards ────────────────────────────────────────────────────────────── */

export function RiverHazardsTab({ river }: RiverTabProps) {
  const { colors } = useTheme();
  const ordered = useMemo(() => sortHazards(river.hazards), [river.hazards]);
  const critical = useMemo(() => criticalHazards(river.hazards).length, [river.hazards]);

  if (!ordered.length) {
    return <Absent>Eddy carries no hazards for this river.</Absent>;
  }

  return (
    <View>
      {critical > 0 ? (
        <Prose>
          {critical === 1
            ? '1 of these needs care or a portage.'
            : `${critical} of these need care or a portage.`}
        </Prose>
      ) : null}

      {ordered.map((hazard) => (
        <Section key={hazard.id} title={hazard.name}>
          <Fact label="Type" value={hazardTypeLabel(hazard.type)} />
          <Fact label="Severity" value={severityLabel(hazard.severity)} />
          <Fact label="Mile" value={hazard.riverMile.toFixed(1)} />
          <Fact label="Portage" value={portageNote(hazard)} />
          <Prose>{hazard.description}</Prose>
          {hazard.seasonalNotes ? (
            <Text style={[styles.rowMeta, { color: colors.textMuted }]}>{hazard.seasonalNotes}</Text>
          ) : null}
        </Section>
      ))}
    </View>
  );
}

/* ── The header ─────────────────────────────────────────────────────────── */

/**
 * The glance: who, what the water is doing, and the way to the full screen.
 *
 * The identity row itself is RiverHead — a real sibling of PlaceHead rather than
 * the 14pt string that used to sit here. What stays in this file is the one
 * navigation row underneath it, which is river-sheet business rather than
 * identity.
 *
 * ── "Open {river}" is no longer duplicated ────────────────────────────────
 * The map screen used to draw its own selected-river line above the map with the
 * name, the condition and a chevron to the very same screen this row opens. That
 * line is gone (see the Map tab's header), so this is the only copy.
 */
export function RiverSheetHeader({
  river,
  onClose,
  onOpenRiver,
  onOpenGauge,
}: {
  river: RiverSheetData;
  onClose: () => void;
  onOpenRiver: (slug: string) => void;
  onOpenGauge: (siteId: string) => void;
}) {
  return (
    <View>
      <RiverHead river={river} onClose={onClose} onOpenGauge={onOpenGauge} />
      <View style={styles.header}>
        <View style={styles.headerLink}>
          <LinkRow
            label={`Open ${river.name}`}
            symbol="river"
            onPress={() => onOpenRiver(river.slug)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16 },
  // The identity row's own styles left with it — see RiverHead, which holds the
  // 44pt frame, the heading scale and the close this file used to declare.
  headerLink: { marginTop: 2 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  gaugeText: { flex: 1, minWidth: 0 },
  // Taller than the other rows because it carries a 44pt thumbnail, and the
  // vertical padding is what keeps two photographs from touching in a list of
  // twelve. minHeight rather than height: an amenity row adds a third line.
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 6,
  },
  // The well, not the image: it holds its size whether a photo arrived or the
  // catalog mark did, so the column of names does not shift down the list.
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%' },
  marks: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  rowName: { ...t.sm, fontFamily: fonts.medium },
  rowMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.sm, fontFamily: fonts.semibold },
});
