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
// ── The footer is a way out, not a caveat ───────────────────────────────────
//
// It used to print the reading-lag note — "Gauge readings can trail the river by
// up to about an hour" — under every state of this card, including the ones with
// no reading anywhere near it. A caveat repeated on a screen that cannot act on
// it is a caveat people stop seeing, and the app makes the same disclosure twice
// more where it bites: on the Alerts tab, beside the thing that will wake your
// phone, and in Profile. What belongs here instead is the next move: the
// headline says nine rivers are floatable, so the footer offers the nine.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Otter } from '@/components/Otter';
import { primary } from '@/theme/palette';
import { readUpdateCollapsed, writeUpdateCollapsed } from '@/lib/todayPreferences';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  /** "9 of 24 rivers are floatable right now", or null when unknowable. */
  headline: string | null;
  /** Eddy's written summary, or null when there is none to show. */
  prose: string | null;
  /** When the prose was generated. Ignored when there is no prose. */
  generatedAt: string | null;
  /**
   * Narrow the list below to the floatable ones.
   *
   * The card's whole headline is a count of them, and until now the only way to
   * act on it was to find the chip row under the search field and work out which
   * chip meant the same thing as the sentence at the top of the screen.
   *
   * Optional: absent when the caller has nothing to filter — the footer then
   * renders nothing rather than a button that does nothing.
   */
  onShowFloatable?: () => void;
  /** How many rivers the CTA would reveal. Absent means "do not name a number". */
  floatableCount?: number | null;
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

export function TodaySummary({
  headline,
  prose,
  generatedAt,
  onShowFloatable,
  floatableCount = null,
}: Props) {
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
  const open = foldable && collapsed === false;

  const toggle = () => {
    const next = !open;
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

      {/* The next move, in the slot the reading-lag caveat used to occupy. Only
          when there is something to reveal: on a morning with nothing floatable
          this would be a button that filters the list down to an empty state. */}
      {open && onShowFloatable && (floatableCount ?? 0) > 0 ? (
        <Pressable
          onPress={onShowFloatable}
          style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={
            floatableCount === 1
              ? 'Show the one floatable river'
              : `Show the ${floatableCount} floatable rivers`
          }
        >
          <Text style={[styles.ctaText, { color: primary[50] }]}>
            {floatableCount === 1
              ? 'Show the one that is floatable'
              : `Show the ${floatableCount} that are floatable`}
          </Text>
          <Ionicons name="arrow-forward" size={15} color={primary[50]} />
        </Pressable>
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
  // A row rather than a filled button: this card is already a solid teal block
  // and a second fill inside it would read as a second card. The arrow is what
  // makes it a control.
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
  ctaText: { ...t.sm, fontFamily: fonts.semibold },
});
