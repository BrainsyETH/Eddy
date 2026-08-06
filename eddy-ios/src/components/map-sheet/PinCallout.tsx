// eddy-ios/src/components/map-sheet/PinCallout.tsx
// What a tapped pin says. MOVED HERE VERBATIM from app/(tabs)/index.tsx, where
// it lived inline in a 2621-line screen file.
//
// The move is deliberately a MOVE and nothing else — no behaviour, no markup
// and no copy changed — so that the diff which relocates 540 lines is one a
// reader can dismiss at a glance, and the diff which turns this into a
// draggable sheet is the only one they have to actually read. Doing both at
// once would have hidden the second inside the first.
//
// DRIVEABLE_LAYERS came with it: it was a module constant in the screen and is
// used by nothing else there.

import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MapAccessPoint } from '@eddy/types';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionText,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { MapPin } from '@/map/RiverMap';
import { PlaceHead } from './PlaceHead';
import { AccessTypeBadges } from './sections';
import { confirmPlanAction, isDriveable, openDirections } from './sheetActions';
import { AvailabilityGlance } from './AvailabilityGlance';
import { localToday } from './availability';
import { STRIP_HEIGHT_SHORT } from './NightStrip';
import { airbnbSearchUrl, STAY_SEARCH_LABEL } from '@/lib/stays';

/**
 * What a tapped pin is, and — for an access point — what to do with it.
 *
 * The put-in / take-out buttons are the bridge between the map and the planner.
 * Without them the map is a picture and the plan is a form; with them, choosing
 * a stretch is something you do by pointing at the river.
 */
export function PinCallout({
  pin,
  accessPoint,
  canSetTakeOut,
  onSetPutIn,
  onSetTakeOut,
  onOpenRiver,
  onOpenGauge,
  onOpenDam,
  onOpenDetail,
  onClose,
  starred = false,
  onToggleStar = null,
}: {
  pin: MapPin;
  accessPoint: MapAccessPoint | null;
  canSetTakeOut: boolean;
  onSetPutIn: () => void;
  onSetTakeOut: () => void;
  onOpenRiver: (slug: string) => void;
  onOpenGauge: (siteId: string) => void;
  onOpenDam: (damId: string) => void;
  /** Takes an already-built route. See MapPin.detailRoute for why it is a path. */
  onOpenDetail: (route: string) => void;
  onClose: () => void;
  starred?: boolean;
  /** Null for anything that cannot be starred, which is everything but gauges. */
  onToggleStar?: (() => void) | null;
}) {
  const { colors, isDark } = useTheme();
  const planAsTakeOut = canSetTakeOut;
  const planActionLabel = planAsTakeOut ? 'Use as take-out' : 'Use as put-in';
  const performPlanAction = planAsTakeOut ? onSetTakeOut : onSetPutIn;

  // See sheetActions: which layers are destinations, and why a hazard is not.
  const driveable = isDriveable(pin);
  const onPlanAction = () =>
    confirmPlanAction({
      accessPoint,
      detailRoute: pin.detailRoute,
      proceed: performPlanAction,
      onOpenDetail,
    });

  /**
   * WHAT THIS PIN IS FOR, resolved once.
   *
   * Exactly one promoted action, chosen by what the pin IS rather than by
   * whichever condition happens to be tested first in the JSX. An access point
   * is for floating from; a dam or a gauge is for reading; an outfitter or a
   * campground is somewhere you drive. A hazard is for none of those — it is
   * information, and its callout correctly offers nothing to do.
   *
   * Directions rides beside a promoted action as the quiet second, and takes
   * the slot itself only when nothing else claimed it. Resolved here, in one
   * place, so the button row and the list below can never both render the
   * same destination.
   *
   * THE FILL is reserved for the float CTA — one solid pill per sheet, and it
   * means "this is what Eddy is for". Other primaries take the interactive
   * outline, which is the emphasis step this callout already used for Details
   * on an access point.
   *
   * The fill is `accentFill`, which is TEAL and not coral however the tone is
   * spelled: coral collides with the condition ladder, and this row can sit
   * directly beneath a `dangerous` reading. See palette.ts and ADR 0007 — the
   * `tone: 'accent'` name below is about rank, not hue.
   */
  const calloutButtons: {
    key: string;
    label: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    tone: 'accent' | 'interactive' | 'neutral';
    onPress: () => void;
    accessibilityLabel?: string;
    hint?: string;
  }[] = [];

  if (accessPoint) {
    calloutButtons.push({
      key: 'plan',
      label: planActionLabel,
      icon: 'flag-outline',
      tone: 'accent',
      onPress: onPlanAction,
      hint: accessPoint.isPublic ? undefined : 'Private access confirmation required',
    });
  } else if (pin.damId) {
    calloutButtons.push({
      key: 'dam',
      label: 'Open dam',
      tone: 'interactive',
      onPress: () => onOpenDam(pin.damId!),
    });
  } else if (pin.siteId) {
    calloutButtons.push({
      key: 'gauge',
      label: 'Open gauge',
      tone: 'interactive',
      onPress: () => onOpenGauge(pin.siteId!),
    });
  } else if (driveable) {
    calloutButtons.push({
      key: 'directions',
      label: 'Directions',
      icon: 'navigate-outline',
      tone: 'interactive',
      onPress: () => openDirections(pin),
      accessibilityLabel: `Directions to ${pin.name}`,
    });
  }

  if (driveable && !calloutButtons.some((b) => b.key === 'directions')) {
    calloutButtons.push({
      key: 'directions',
      label: 'Directions',
      icon: 'navigate-outline',
      tone: 'neutral',
      onPress: () => openDirections(pin),
      accessibilityLabel: `Directions to ${pin.name}`,
    });
  }

  const stayUrl = airbnbSearchUrl(pin.coordinates);

  const promoted = new Set(calloutButtons.map((b) => b.key));

  /**
   * Everywhere else this pin can take you.
   *
   * Rows, not buttons, because that is what they are: navigation. Dressing a
   * destination as the peer of a call to action was the original error, and
   * the width it cost is what broke the row.
   */
  const calloutRows: {
    key: string;
    label: string;
    onPress: () => void;
    external?: boolean;
    accessibilityLabel?: string;
  }[] = [];

  // The dam screen is a different destination from the gauge one — Stockton
  // and Truman have a damId and no siteId at all, because they publish nothing
  // to CWMS and so have no gauge row to open. See MapPin.damId.
  if (pin.damId && !promoted.has('dam')) {
    calloutRows.push({ key: 'dam', label: 'Open dam', onPress: () => onOpenDam(pin.damId!) });
  }
  // BEFORE the river. A gauge callout is a number, and the question a number
  // provokes is "how did it get there" — which is a chart, not a river page.
  if (pin.siteId && !promoted.has('gauge')) {
    calloutRows.push({ key: 'gauge', label: 'Open gauge', onPress: () => onOpenGauge(pin.siteId!) });
  }
  if (pin.detailRoute) {
    calloutRows.push({
      key: 'details',
      // Spelled out now that it has a whole row. It was abbreviated to
      // "Details" only because it was a flex:1 pill sharing a row with up to
      // three others, which is the constraint this layout removed.
      label: accessPoint ? 'Access point details' : 'Details',
      onPress: () => onOpenDetail(pin.detailRoute!),
      accessibilityLabel: `Open ${pin.name}`,
    });
  }
  if (pin.link) {
    calloutRows.push({
      key: 'link',
      label: pin.link.label,
      onPress: () => void Linking.openURL(pin.link!.url),
      external: true,
    });
  }
  // ── Somewhere to sleep that is not a campsite ────────────────────────────
  // Campgrounds only, and last among the outward links: it points away from the
  // place the reader opened, so it must never outrank that place's own booking
  // link. It earns its row most when the glance above says "Fully booked",
  // which today is the end of the conversation while the app has known the
  // coordinates the whole time. A search, never a count — see lib/stays.ts.
  if (pin.layer === 'campgrounds' && stayUrl) {
    calloutRows.push({
      key: 'stays',
      label: STAY_SEARCH_LABEL,
      onPress: () => void Linking.openURL(stayUrl),
      external: true,
    });
  }
  // A gauge belongs to a river, and the river screen is where its history, its
  // scale and Eddy's read on it live.
  if (pin.riverSlug) {
    calloutRows.push({
      key: 'river',
      label: 'View river',
      onPress: () => onOpenRiver(pin.riverSlug!),
    });
  }

  return (
    <View style={styles.callout}>
      {/* The identity row is PlaceHead's, shared with the tabbed sheet's own
          header. This callout IS the peek until the detail request qualifies a
          second tab (see PinSheet), so the two are the same place seconds apart
          and used to disagree about how big its photo was. */}
      <PlaceHead
        pin={pin}
        accessPoint={accessPoint}
        starred={starred}
        onToggleStar={onToggleStar}
        onClose={onClose}
      />

      {accessPoint ? <AccessTypeBadges accessPoint={accessPoint} /> : null}

      {/* The private notice, which is now the whole of the private signal at
          this zoom — the pin itself no longer carries a padlock. Kept as a
          NOTE rather than a lock: "permission may be required" is a thing to
          go and ask about, and a padlock reads as a thing that is shut. */}
      {accessPoint && !accessPoint.isPublic ? (
        <View style={[styles.calloutPrivate, { backgroundColor: colors.cardRaised }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.calloutPrivateText, { color: colors.textMuted }]}>
            Private access — permission may be required
          </Text>
        </View>
      ) : null}

      {/* The reading and its verdict on one line: a gauge's number means nothing
          without the band it sits in, and the band means less without the
          number. Same rule the river row is built on.

          THE CHIP NO LONGER REQUIRES A CONDITION CODE. It used to, and the one
          layer that carries a label without a code is the national gauge tier —
          deliberately, because a flow band is a comparison to a station's own
          history and never a verdict about floating. So the pin that most
          needed its label explained was the only one that never showed it, and
          a tapped reference gauge came back as a bare number. A code still
          buys the condition tint; without one the chip is drawn in the pin's
          own band colour, which is what the dot on the map is wearing. */}
      {pin.value || pin.codeLabel ? (
        <View style={styles.calloutReadingRow}>
          {pin.value ? (
            <Text
              style={[
                styles.calloutReading,
                { color: pin.code ? conditionText(pin.code, isDark) : colors.text },
              ]}
            >
              {pin.value}
            </Text>
          ) : null}
          {pin.codeLabel ? (
            <View
              style={[
                styles.calloutChip,
                pin.code
                  ? {
                      backgroundColor: conditionBg(pin.code),
                      borderColor: conditionChipBorder(pin.code),
                    }
                  : { backgroundColor: colors.cardRaised, borderColor: pin.color ?? colors.border },
              ]}
            >
              <Text
                style={[
                  styles.calloutChipText,
                  { color: pin.code ? conditionInk(pin.code) : colors.textMuted },
                ]}
              >
                {pin.codeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── THE WATER AT A PUT-IN IS NOT DRAWN HERE ANY MORE ────────
          It moved to the tabbed sheet's own header, where it is now the first
          thing under the name — see AccessGaugeReading in sections.tsx. This
          callout no longer renders for access points at all: PinSheet decides
          the shell from what was TAPPED rather than from how many tabs have
          qualified, so a put-in holds the tabbed shape from its first frame
          and this is the non-access sheet. Keeping a copy here would have been
          a second reading nobody could reach. */}

      {/* ── NOT CAPPED AT FOUR LINES ANY MORE ──────────────────────────
          It was, on the argument that a callout grown to a hazard's full
          seasonal notes covers the river it is describing. True of a callout
          that could only ever be one height; this one has detents. What the cap
          actually did was make the rest of a hazard PERMANENTLY unreadable —
          and a hazard's body is the portage instruction, the description and
          the seasonal notes joined (see RiverMap), so four lines routinely cut
          off two of the three. The river screen "has room" only if you know to
          go there, which nothing here said.

          The glance is defended by the DETENT instead, which is the thing that
          was actually being asked for: a long body pushes the content below the
          fold rather than lengthening the peek, and pushing content below the
          fold is how this sheet earns its half and full heights. A short
          body still fits inside the glance and still gets one detent, exactly
          as before. See wholeContentIsPeek in sheetGeometry. */}

      {/* Availability outranks the description, because for somewhere to sleep
          this weekend it IS the question, and the prose below it is the same
          sentence it was last season. This is the only place a Missouri State
          Park's inventory appears at all — a state park has no
          nps_campgrounds row and so never reaches the tabbed sheet's header. */}
      <AvailabilityGlance
        availability={pin.availability}
        name={pin.name}
        today={localToday()}
        stripHeight={STRIP_HEIGHT_SHORT}
      />

      {pin.body ? (
        <Text style={[styles.calloutBody, { color: colors.textMuted }]}>{pin.body}</Text>
      ) : null}

      {/* ── One primary, one secondary, and rows for the rest ───────
          This was seven equal pills in one flex row. Once Directions joined
          them a typical access point carried four — flex 1/2/1/1 across a
          332pt card, which is about 62pt each, and "Directions" at 14pt is
          not 62pt wide. `flexWrap` could not rescue it either: flex:1 sets
          flexBasis to 0, so no child ever exceeds its basis and the row
          squeezes instead of wrapping.

          The fix is the hierarchy the row never had. A callout has ONE thing
          it is for — float from this put-in, read this gauge, drive to this
          outfitter — and everything else on it is a way to somewhere else.
          Actions get buttons; destinations get rows. Two buttons at flex 1
          are 162pt each and a row is full width, so nothing has to be
          abbreviated to fit, and both clear the 44pt touch floor the pills
          missed at 41 (DESIGN.md §6). */}
      {calloutButtons.length > 0 ? (
        <View style={styles.calloutPrimaryRow}>
          {calloutButtons.map((button) => {
            const filled = button.tone === 'accent';
            const ink = filled
              ? colors.onAccent
              : button.tone === 'interactive'
                ? colors.interactive
                : colors.text;
            return (
              <Pressable
                key={button.key}
                onPress={button.onPress}
                style={({ pressed }) => [
                  styles.calloutPrimary,
                  {
                    // accentFill, not accent: this is a SOLID CTA carrying
                    // `onAccent` text, and onAccent is white. White on
                    // accent[500] does not clear 4.5:1 — accentFill
                    // (accent[700]) is the fill the white was chosen against,
                    // and is what every other coral CTA in the app uses.
                    backgroundColor: filled
                      ? pressed
                        ? colors.accentFillPressed
                        : colors.accentFill
                      : 'transparent',
                    borderColor: filled
                      ? pressed
                        ? colors.accentFillPressed
                        : colors.accentFill
                      : button.tone === 'interactive'
                        ? colors.interactive
                        : colors.border,
                    opacity: !filled && pressed ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={button.accessibilityLabel}
                accessibilityHint={button.hint}
              >
                {button.icon ? <Ionicons name={button.icon} size={15} color={ink} /> : null}
                <Text style={[styles.calloutPrimaryText, { color: ink }]} numberOfLines={1}>
                  {button.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {calloutRows.length > 0 ? (
        <View style={styles.calloutLinks}>
          {calloutRows.map((row) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              style={({ pressed }) => [styles.calloutLink, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={row.accessibilityLabel}
            >
              <Text style={[styles.calloutLinkText, { color: colors.text }]} numberOfLines={1}>
                {row.label}
              </Text>
              {/* An arrow that leaves the app for one that stays in it. The
                  difference is worth a glyph: one of these opens Safari. */}
              <Ionicons
                name={row.external ? 'open-outline' : 'chevron-forward'}
                size={16}
                color={colors.textSubtle}
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── When it was measured ────────────────────────────────────
          LAST, under the actions, in the quietest ink on the card. It is a
          qualifier on everything above it rather than another fact beside them,
          and putting it in the subtitle — where the curated tier used to keep
          it — made the identification line carry two unrelated jobs while the
          national tier carried neither.

          Absent, not "unknown", when the station never reported a timestamp.
          A row that says "Updated: unknown" is a row about the app. */}
      {pin.updatedAt ? (
        <Text style={[styles.calloutUpdated, { color: colors.textMuted }]} numberOfLines={1}>
          {pin.updatedAt}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // NO background, radius or elevation of its own: MapSheet is the card now,
  // and a second one inside it read as a card on a card. Horizontal padding
  // matches the calloutWrap this replaced; the sheet supplies the rest.
  callout: { paddingHorizontal: 16, paddingBottom: 4 },
  // The identity row's own styles left with it — see PlaceHead. So did the type
  // pills, which are AccessTypeBadges in sections.tsx now.
  calloutPrivate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    marginTop: 9,
  },
  calloutPrivateText: { ...t.sm, fontFamily: fonts.medium, flex: 1 },
  calloutReadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  calloutReading: { ...t.lg, fontFamily: fonts.mono },
  calloutChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  calloutChipText: { ...t.sm, fontFamily: fonts.semibold },
  calloutBody: { ...t.sm, fontFamily: fonts.body, marginTop: 9 },
  calloutUpdated: { ...t.sm, fontFamily: fonts.body, marginTop: 10 },
  // At most two, equal width. On the narrowest phone that is ~162pt each,
  // which fits every label this callout has without abbreviating one.
  calloutPrimaryRow: { flexDirection: 'row', gap: 8, marginTop: 11 },
  calloutPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    // 44 is the touch floor from DESIGN.md §6 and is not negotiable. The pills
    // this replaced were 41.
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
  },
  calloutPrimaryText: { ...t.sm, fontFamily: fonts.semibold },
  calloutLinks: { marginTop: 4 },
  calloutLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  calloutLinkText: { ...t.sm, fontFamily: fonts.medium, flex: 1 },
});
