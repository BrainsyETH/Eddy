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
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { spokenWeekday } from './availability';
import {
  groupSites,
  stateLabel,
  summariseByKind,
  type LoopGroup,
  type SiteOnNight,
} from './siteList';

/** Rows per loop before the list asks whether you meant it. */
const VISIBLE_PER_LOOP = 12;

function SiteRow({ entry, date }: { entry: SiteOnNight; date: string }) {
  const { colors } = useTheme();
  const { site, tags, state } = entry;
  const badge = stateLabel(state);
  const label = site.name ?? `Site ${site.id.slice(0, 6)}`;
  const detail = [badge, ...tags].filter(Boolean).join(' · ');

  const openable = Boolean(site.bookingUrl);

  return (
    <Pressable
      onPress={() => {
        if (site.bookingUrl) void Linking.openURL(site.bookingUrl);
      }}
      disabled={!openable}
      style={({ pressed }) => [styles.row, { opacity: pressed && openable ? 0.6 : 1 }]}
      // A row that leaves for Safari is a link, not a button. LinkRow hardcodes
      // `button`, which is why this one is built here rather than reusing it.
      accessibilityRole={openable ? 'link' : 'text'}
      accessibilityLabel={
        `${label}${site.loop ? `, ${site.loop}` : ''}` +
        `${detail ? `, ${detail}` : ''}, open ${spokenWeekday(date)}` +
        `${openable ? '. Opens Recreation.gov.' : ''}`
      }
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.rowDetail, { color: colors.textMuted }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {openable ? (
        <Ionicons name="open-outline" size={16} color={colors.textSubtle} />
      ) : null}
    </Pressable>
  );
}

/**
 * The same inventory as counts, for a feed whose sites link nowhere.
 *
 * See summariseByKind. Two lines instead of sixty-four, and nothing is lost:
 * the rows it replaces carried a number, a name repeated verbatim down the
 * column, and no destination.
 */
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

function Loop({ group, date }: { group: LoopGroup; date: string }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.open : group.open.slice(0, VISIBLE_PER_LOOP);
  const hidden = group.open.length - shown.length;

  // ── A ROW IS A LINK. WITHOUT ONE IT IS A NUMBER ─────────────────────────
  // Every site row here deep-links to that site's own booking page, which is
  // what makes it worth a 44pt target. UseDirect — every Missouri State Park —
  // publishes no per-unit URL, so those rows lead nowhere, and Onondaga rendered
  // as dozens of untappable lines reading "Basic #001", "Basic #002". The counts
  // say the same thing in two lines and are honest about what Eddy has.
  const tappable = group.open.some((entry) => Boolean(entry.site.bookingUrl));

  return (
    <View style={styles.loop}>
      {group.loop ? (
        <Text style={[styles.loopName, { color: colors.textMuted }]}>{group.loop}</Text>
      ) : null}

      {!tappable ? <KindSummaries group={group} date={date} /> : null}

      {tappable
        ? shown.map((entry) => <SiteRow key={entry.site.id} entry={entry} date={date} />)
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
}: {
  entries: SiteOnNight[];
  filters: string[];
  date: string;
}) {
  const { colors } = useTheme();
  const groups = groupSites(entries, filters as never);

  if (groups.length === 0) return null;

  const anyOpen = groups.some((group) => group.open.length > 0);

  return (
    <View>
      {groups.map((group) => (
        <Loop key={group.loop ?? '—'} group={group} date={date} />
      ))}
      {!anyOpen ? (
        <Text style={[styles.taken, { color: colors.textMuted }]}>
          {filters.length > 0
            ? 'No sites match those filters that night.'
            : 'Nothing open that night.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loop: { marginTop: 10 },
  loopName: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  // The 44pt floor from DESIGN.md §6, same as LinkRow's.
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { ...t.sm, fontFamily: fonts.medium },
  rowDetail: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
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
