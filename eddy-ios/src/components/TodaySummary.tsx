// eddy-ios/src/components/TodaySummary.tsx
// The answer, at the top of the screen named for it.
//
// Two things that are one statement: how many rivers are floatable, and what
// Eddy makes of the water generally. The count is computed here from the live
// list; the prose is written once a day by the same generator that has fed the
// website for a while (src/lib/eddy/generate-global-update.ts) and arrives
// through /api/eddy-updates under the key "global".
//
// ── The count outranks the prose ────────────────────────────────────────────
//
// The card is built so the prose is the part that can go missing. The count
// comes off the list already on screen and is true whenever the list is; the
// prose is a day old by construction and the server withholds it the moment it
// cannot stand behind it. So the card renders on the count, adds the prose
// when there is prose, and never renders on prose alone.
//
// That ordering is also why the count is not in the paragraph. A number nested
// inside two sentences of narration is a number somebody has to read for, on
// the screen they opened to avoid exactly that.
//
// ── Saying when it was written ──────────────────────────────────────────────
//
// Non-negotiable, and the reason `generatedAt` is on the wire at all. Every
// other number on this screen is minutes old; this paragraph is hours old, and
// it is the only thing here that reads as observation rather than measurement.
// The stamp is what keeps it from being mistaken for the former.

import { StyleSheet, Text, View } from 'react-native';
import { READING_LAG_NOTE } from '@eddy/conditions/floatable-headline';
import { Otter } from '@/components/Otter';
import { primary } from '@/theme/palette';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  /** "9 of 24 rivers are floatable right now", or null when unknowable. */
  headline: string | null;
  /** Eddy's written summary, or null when there is none to show. */
  prose: string | null;
  /** When the prose was generated. Ignored when there is no prose. */
  generatedAt: string | null;
}

/**
 * "this morning" / "3 hours ago" — deliberately vague at the coarse end.
 *
 * The precision people need from this is "not just now", and a paragraph is
 * not a reading. Minutes would imply the prose tracks the water.
 */
function writtenAge(iso: string, now = new Date()): string | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const hours = (now.getTime() - then) / 3_600_000;
  if (hours < 0) return null;
  if (hours < 1) return 'Written in the last hour';
  if (hours < 2) return 'Written an hour ago';
  return `Written ${Math.round(hours)} hours ago`;
}

export function TodaySummary({ headline, prose, generatedAt }: Props) {
  // No count, no card. See the header: the prose never carries this alone.
  if (!headline) return null;

  const written = prose && generatedAt ? writtenAge(generatedAt) : null;

  return (
    <View style={[styles.card, { backgroundColor: primary[800] }]}>
      <View style={styles.top}>
        {/* Small, and beside the headline rather than over it. Eddy is the
            voice here, not the subject. */}
        <Otter mood="standard" size={44} />
        {/* primary[50] and [100] rather than a theme role: this card is teal
            in BOTH schemes, so it needs ink chosen against teal, not against
            whichever background the app is currently wearing. DESIGN.md §2
            names the 100/50 steps for exactly this — content on dark. */}
        <Text style={[styles.headline, { color: primary[50] }]}>{headline}</Text>
      </View>

      {prose ? <Text style={[styles.prose, { color: primary[100] }]}>{prose}</Text> : null}

      {/* The caveat belongs to the count and is therefore always shown; the
          written-at stamp belongs to the prose and comes and goes with it. */}
      <Text style={[styles.footnote, { color: primary[300] }]}>
        {written ? `${written} · ${READING_LAG_NOTE}` : READING_LAG_NOTE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, borderRadius: 16, padding: 16, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Fredoka, like the screen title above it — this is Eddy speaking, and the
  // display face is where the brand actually lives.
  headline: { ...t.xl, fontFamily: fonts.display, flex: 1 },
  prose: { ...t.sm, fontFamily: fonts.body, lineHeight: 21 },
  footnote: { ...t.xs, fontFamily: fonts.body },
});
