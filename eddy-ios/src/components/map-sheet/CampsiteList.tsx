// eddy-ios/src/components/map-sheet/CampsiteList.tsx
// Which site, not just how many.
//
// ── No FlatList here, on purpose ──────────────────────────────────────────
//
// Every tab in this sheet is already inside SheetPager's Animated.ScrollView,
// so a FlatList would nest VirtualizedLists — a real warning and a real scroll
// bug. The answer is not virtualization, it is having fewer rows: only sites
// somebody can actually book tonight get one, and the rest collapse to a count
// per loop. On a busy weekend that is eight rows out of a hundred and ninety
// seven, and "+22 taken" says more than twenty-two dimmed rows would.
//
// A loop with an unusually long open list is still capped, because a hundred
// rows inside a sheet that is also a scroll surface is a scroll fight.

import { useState } from 'react';
import type { CampsitePhoto } from '@eddy/types';
import { CampingSiteCard } from '../CampingSiteCard';
import { campingStayState } from '@eddy/conditions/camping-policy';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { spokenWeekday } from './availability';
import {
  groupSites,
  listOutcome,
  summariseByKind,
  type LoopGroup,
  type SiteOnNight,
} from './siteList';

/** Rows per loop before the list asks whether you meant it. */
const VISIBLE_PER_LOOP = 12;

function SiteRow({ entry, date, photos, photoFacilityId, reservationUrl, campgroundName, hideLoop, now }: {
  entry: SiteOnNight; date: string; photos?: CampsitePhoto[]; photoFacilityId?: string; reservationUrl?: string;
  campgroundName?: string; hideLoop: boolean; now: number;
}) {
  const nights = [{ date, state: entry.state }];
  return <CampingSiteCard entry={{ site: entry.site, nights, state: campingStayState(nights) }}
    facilityId={photoFacilityId} photos={photos} bookingUrl={reservationUrl} now={now}
    campgroundName={campgroundName} hideLoop={hideLoop} dense />;
}

/** Compact counts for fully booked loops or feeds without site-level content. */
function KindSummaries({ group, date }: { group: LoopGroup; date: string }) {
  const { colors } = useTheme();
  const summaries = summariseByKind([...group.open, ...group.taken]);
  if (!summaries.length) return null;

  return (
    <View>
      {summaries.map((summary) => (
        <View key={summary.kind} style={styles.summaryRow}>
          <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
            {summary.kind}
          </Text>
          <Text
            style={[
              styles.summaryCount,
              { color: summary.open > 0 ? colors.success : colors.textSubtle },
            ]}
            // One utterance for the pair, or VoiceOver reads a name and a
            // fragment as two unrelated stops.
            accessibilityLabel={`${summary.kind}, ${summary.open} of ${summary.total} open ${spokenWeekday(date)}`}
          >
            {summary.open} of {summary.total} open
          </Text>
        </View>
      ))}
    </View>
  );
}

function Loop({
  group,
  date,
  showName,
  campgroundName,
  now,
  photos,
  individualSites,
  photoFacilityId,
  reservationUrl,
}: {
  group: LoopGroup;
  date: string;
  campgroundName?: string;
  now: number;
  photos?: Record<string, CampsitePhoto[]>;
  individualSites?: boolean;
  photoFacilityId?: string;
  reservationUrl?: string;
  /**
   * A loop name earns its line only when there is another loop to tell it from.
   *
   * Onondaga has exactly one, called "Campground", so the tab read
   * "Sites" / "CAMPGROUND" — a heading followed by a subheading that repeats it
   * and divides nothing. Alley Spring has ten and needs every one of them.
   */
  showName: boolean;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.open : group.open.slice(0, VISIBLE_PER_LOOP);
  const hidden = group.open.length - shown.length;

  // State Parks rows carry individually fetched photos and can open the park
  // reservation page when the provider does not supply an exact-site URL.
  const tappable = group.open.some((entry) => individualSites || Boolean(entry.site.bookingUrl));

  return (
    <View style={styles.loop}>
      {showName && group.loop ? (
        <Text style={[styles.loopName, { color: colors.textMuted }]}>{group.loop}</Text>
      ) : null}

      {!tappable ? <KindSummaries group={group} date={date} /> : null}

      {tappable
        ? shown.map((entry) => <SiteRow key={entry.site.id} entry={entry} date={date} photos={photos?.[entry.site.id]} photoFacilityId={photoFacilityId} reservationUrl={reservationUrl} campgroundName={campgroundName} hideLoop={showName} now={now} />)
        : null}

      {tappable && hidden > 0 ? (
        <Pressable
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [styles.more, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.moreText, { color: colors.interactive }]}>
            Show {hidden} more
          </Text>
        </Pressable>
      ) : null}

      {/* Booked, closed and unreleased all mean "not tonight" to somebody
          scrolling for a bed, and none of them is worth a row of its own.
          Suppressed under the summary, which already carries them as its
          denominator — "+28 taken" beneath "Basic 12 of 40" counts them twice. */}
      {tappable && group.taken.length > 0 ? (
        <Text style={[styles.taken, { color: colors.textSubtle }]}>
          {group.open.length === 0
            ? `All ${group.taken.length} taken`
            : `+${group.taken.length} taken`}
        </Text>
      ) : null}
    </View>
  );
}

export function CampsiteList({
  entries,
  filters,
  date,
  dateLabel,
  photos,
  individualSites,
  photoFacilityId,
  reservationUrl,
  campgroundName,
  now,
}: {
  campgroundName?: string;
  now: number;
  photos?: Record<string, CampsitePhoto[]>;
  individualSites?: boolean;
  photoFacilityId?: string;
  reservationUrl?: string;
  entries: SiteOnNight[];
  filters: string[];
  date: string;
  /**
   * The night in words — `Tonight`, `Friday, Aug 14`.
   *
   * The empty lines below used to end in "that night", which referred to a
   * selection made two sections up the page and visible nowhere near here. A
   * demonstrative needs something to point AT.
   *
   * Leads the sentence rather than being appended to it, because the three
   * forms this takes do not share a grammar: "Nothing open on Friday, Aug 14"
   * works and "Nothing open on Tonight" does not.
   */
  dateLabel?: string;
}) {
  const { colors } = useTheme();
  const groups = groupSites(entries, filters as never);
  // ── NO EARLY RETURN ON AN EMPTY GROUPING ────────────────────────────────
  // This used to be `if (groups.length === 0) return null`, which drew the
  // section's heading — now naming a night — above nothing whatsoever. Three
  // different facts arrive here as zero groups and only one of them is about
  // the campground; see listOutcome, which keeps them apart.
  const outcome = listOutcome(entries, groups, filters as never);

  // Lead with the night in every one of them. The copy used to end in "that
  // night", pointing at a selection made two sections up the page.
  const lead = dateLabel ?? 'That night';

  return (
    <View>
      {groups.map((group) => (
        <Loop
          key={group.loop ?? '—'}
          group={group}
          photos={photos}
          individualSites={individualSites}
          photoFacilityId={photoFacilityId}
          reservationUrl={reservationUrl}
          date={date}
          showName={groups.length > 1}
          campgroundName={campgroundName}
          now={now}
        />
      ))}
      {outcome === 'sites' ? null : (
        <Text style={[styles.taken, { color: colors.textMuted }]}>
          {outcome === 'none_open'
            ? `${lead} — nothing open.`
            : outcome === 'no_confirmed_openings'
              ? `${lead} — no confirmed openings. Some sites haven’t been updated.`
            : outcome === 'filtered_out'
              ? `${lead} — no sites match those filters.`
              : // Not a claim about the campground. Most nights outside the
                // feed's own window land here, and so does a night whose sites
                // all decoded to 'unknown'.
                `${lead} — availability was not measured.`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loop: { marginTop: 10, gap: 8 },
  loopName: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowLabel: { ...t.sm, fontFamily: fonts.medium },
  // Not 44: these are not controls, and a facility with six kinds should not
  // spend 264pt saying so.
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 26,
  },
  summaryCount: { ...t.sm, fontFamily: fonts.semibold },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { ...t.sm, fontFamily: fonts.semibold },
  taken: { ...t.xs, fontFamily: fonts.body, marginTop: 4 },
});
