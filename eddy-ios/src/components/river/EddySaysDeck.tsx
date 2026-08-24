// eddy-ios/src/components/river/EddySaysDeck.tsx
// Eddy's free line about this river — the deck over EddyTake's gated body.
//
// ── Why this is a deck and not a card ───────────────────────────────────────
//
// The obvious shape was a second card above EddyTake. It is the wrong one. The
// generator's prompt says, in as many words, "state the condition clearly in the
// first sentence of both the summary and the full text" — so a standalone card
// would put two apparently independent panels on the screen, a thumb's width
// apart, opening with the same verdict. A reader would be right to wonder which
// one to believe.
//
// So it is one section: this line is the deck, EDDY'S READ below it is the body.
// The newspaper arrangement, and it reads as deliberate for the same reason a
// standfirst does — the short line is the entry to the long one, not a rival
// summary of it.
//
// ── It never waits on entitlement, and that is the point ────────────────────
//
// The deck is free at every state, so it renders the moment the batched updates
// land and never consults `entitled`. Only the body below it branches. That is
// what keeps this off the flash EddyTake's three-state `entitled` prop was
// written to prevent: nothing here paints and then vanishes when
// /api/me/profile answers, because nothing here asked.
//
// ── It cannot render the paid quote ─────────────────────────────────────────
//
// The prop is an EddySays, whose only text field is the free summary — there is
// no quoteText for anything to reach for, however the wiring above changes.
// selectEddySays is the only way to make one. See src/lib/eddySays.ts.
//
// ── Saying when it was written ──────────────────────────────────────────────
//
// Same rule TodaySummary states and for the same reason: every other number on
// the river screen is minutes old, and this sentence is hours old. It is the one
// thing in the column that reads as observation rather than measurement, and the
// stamp is what stops it being mistaken for the former. Shared formatter, so the
// two surfaces cannot drift.

import { StyleSheet, Text, View } from 'react-native';
import { Otter } from '@/components/Otter';
import type { EddySays } from '@/lib/eddySays';
import { writtenAge } from '@/lib/eddySays';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function EddySaysDeck({ says }: { says: EddySays }) {
  const { colors } = useTheme();
  const written = writtenAge(says.generatedAt);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {/* Small, and beside the line rather than over it. Eddy is the voice
            here, not the subject — the same call TodaySummary makes. */}
        <Otter mood="standard" size={34} />
        <Text style={[styles.text, { color: colors.text }]}>{says.text}</Text>
      </View>
      {written ? (
        <Text style={[styles.footnote, { color: colors.textSubtle }]}>{written}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Larger than the body below it and set in the semibold face: this is the
  // lede. The gated read under it is `sectionText`, a step down, which is what
  // makes the pair read as deck-and-body rather than as two paragraphs.
  text: { ...t.base, fontFamily: fonts.semibold, flex: 1, lineHeight: 22 },
  footnote: { ...t.xs, fontFamily: fonts.body },
});
