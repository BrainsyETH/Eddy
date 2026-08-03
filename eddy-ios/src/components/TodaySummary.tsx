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
// It is also why the FOLD works the way it does. Collapsing this card hides the
// paragraph and keeps the count — the headline stays at full size in both
// states, because a control that could hide the answer would be a control
// nobody would remember setting. See src/lib/todayPreferences.ts.
//
// ── Saying when it was written ──────────────────────────────────────────────
//
// Non-negotiable, and the reason `generatedAt` is on the wire at all. Every
// other number on this screen is minutes old; this paragraph is hours old, and
// it is the only thing here that reads as observation rather than measurement.
// The stamp is what keeps it from being mistaken for the former.
//
// ── The card has no footer, and has stopped having one twice ────────────────
//
// It printed the reading-lag note first — "Gauge readings can trail the river by
// up to about an hour" — under every state of this card, including the ones with
// no reading anywhere near it. A caveat repeated on a screen that cannot act on
// it is a caveat people stop seeing, and the app makes the same disclosure twice
// more where it bites: on the Alerts tab, beside the thing that will wake your
// phone, and in Profile.
//
// What replaced it was a "Show the 9 that are floatable" row, on the reasoning
// that the headline states a count and the reader should be able to act on it.
// That is gone too. The count is a fact about the Ozarks, not a filter, and
// restating it as a button directly under the sentence that just said it made
// the card ask a question it had already answered — three lines of teal to
// arrive at the chip row a thumb's width below, which does the same thing,
// says the same number, and is on screen either way.
//
// So the card is the headline and the paragraph, and nothing else. Anything
// that wants to be under the prose has to earn the slot against being absent.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Otter } from '@/components/Otter';
import { primary } from '@/theme/palette';
import {
  collapsedAfterToggle,
  isUpdateOpen,
  readUpdateCollapsed,
  writeUpdateCollapsed,
} from '@/lib/todayPreferences';
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
  /**
   * Undefined until the stored answer lands, and that third state matters.
   *
   * Defaulting to open and correcting a moment later makes the tab open with a
   * paragraph that then vanishes under the reader's thumb — worse than the
   * scroll the fold exists to save. Defaulting to shut does the same thing in
   * the other direction to everyone who has never touched it. So the card holds
   * the headline alone until the preference is known, which is one frame on any
   * device and is the state it shares with "collapsed" anyway.
   */
  const [collapsed, setCollapsed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void readUpdateCollapsed().then((stored) => {
      if (!cancelled) setCollapsed(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // No count, no card. See the header: the prose never carries this alone.
  if (!headline) return null;

  const written = prose && generatedAt ? writtenAge(generatedAt) : null;
  // Nothing to fold on a day the server withheld the prose, so the control is
  // absent rather than disabled — a chevron that opens an empty card is a
  // chevron that teaches people the card is broken.
  const foldable = Boolean(prose);
  const open = isUpdateOpen(foldable, collapsed);

  // Both halves come from todayPreferences, and neither is written out here.
  // This used to be `const next = !open`, which is the state the card is ALREADY
  // in — so the chevron flipped its own glyph and nothing else, forever. See the
  // two functions' comments.
  const toggle = () => {
    const next = collapsedAfterToggle(open);
    setCollapsed(next);
    void writeUpdateCollapsed(next);
  };

  return (
    <View style={[styles.card, { backgroundColor: primary[800] }]}>
      {/* The whole head is the control, not just the chevron: this is a card
          somebody folds while holding a phone one-handed, and a 24pt glyph in
          the corner is the smallest target on the screen. */}
      <Pressable
        onPress={foldable ? toggle : undefined}
        disabled={!foldable}
        style={({ pressed }) => [styles.top, { opacity: pressed && foldable ? 0.75 : 1 }]}
        accessibilityRole={foldable ? 'button' : undefined}
        accessibilityState={foldable ? { expanded: open } : undefined}
        accessibilityLabel={
          foldable
            ? `${headline}. ${open ? "Hide Eddy's update" : "Show Eddy's update"}`
            : undefined
        }
      >
        {/* Small, and beside the headline rather than over it. Eddy is the
            voice here, not the subject. */}
        <Otter mood="standard" size={44} />
        {/* primary[50] and [100] rather than a theme role: this card is teal
            in BOTH schemes, so it needs ink chosen against teal, not against
            whichever background the app is currently wearing. DESIGN.md §2
            names the 100/50 steps for exactly this — content on dark. */}
        <Text style={[styles.headline, { color: primary[50] }]}>{headline}</Text>
        {foldable ? (
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={primary[300]}
          />
        ) : null}
      </Pressable>

      {open && prose ? (
        <>
          <Text style={[styles.prose, { color: primary[100] }]}>{prose}</Text>
          {written ? (
            <Text style={[styles.footnote, { color: primary[300] }]}>{written}</Text>
          ) : null}
        </>
      ) : null}
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
