# Em dashes in user-visible copy — decided: not adopted

**Status: decided. Do not implement a ban. One carve-out was extracted and shipped.**

This was Priority 5.1 of `docs/eddy-ios-copy-improvement-plan.md`, split out
because it is a brand-voice decision rather than an accuracy fix, and because it
was the single largest workstream in that plan.

The previous revision ended with "Measure first… a filtered count is a
prerequisite for deciding whether this is worth doing." That count has now been
taken, and it decides the question against the rule.

## The question

Should user-visible prose in the iOS app avoid em dashes?

**No.** The em dash is the house voice, and the one class of usage that looked
repetitive enough to justify a rule turns out to be the app's most consistent
idiom rather than a tic.

## The measurement

Counting was always the blocker. A naive `grep` for `—` returns over 1,500 hits
across `eddy-ios/app` and `eddy-ios/src`, overwhelmingly in comments — this
codebase's module headers use `── box drawing ──` rules and quote the strings
they explain. The first revision of the plan claimed "more than 50 user-visible"
occurrences; that figure was never derived from a filtered count.

The comment-stripping state machine written for
`missouri-float-planner/src/lib/voice-copy.test.ts` makes the filtered count
cheap. Run over comment-stripped sources, the real figure is **67 lines**:

| Class | Count | Verdict |
| --- | --- | --- |
| Prose apposition and interruption | ~33 | Correct. This is the voice. |
| `[State] — [what it means for you]` | ~30 | A deliberate pattern. See below. |
| Missing-value glyph | 2 | Not a style question. Extracted, see below. |
| Developer `warn()` calls | 2 | Not user-visible. |

Only **one** string in the app contains two em dashes, and it is a false
positive — `alertCopy.ts:100` holds two separate short strings on one line. The
stacking problem a rule would exist to prevent is not present.

### On taking the count early

The earlier recommendation was to land the main plan's Priorities 1–4 first and
then re-count. This count was taken before that work landed, so it is worth
stating what those rewrites would change. Roughly nine of the 67 sit in strings
the plan already rewrites for accuracy, and those replacements happen not to use
a dash — `index.tsx:1404`, `layers.ts:245`, `GaugeFilterBar.tsx:234`,
`alerts/new.tsx:187`, `profile.tsx:265`, `UpgradeGate.tsx:35`,
`EddyTake.tsx:345`, and `favorites.tsx:343`/`:441`.

That leaves about 58 afterwards, with the class proportions essentially
unchanged. The conclusion does not depend on when the count was taken.

## Why the repetitive class is not the argument it looks like

The earlier draft assumed that a residue which is "large and repetitive" argues
*for* adopting the rule. The residue is repetitive, and it argues the opposite
way.

Those ~30 strings are one shape:

> `Conditions unavailable — pull to refresh`
> `Already sent — tap to set it again`
> `Paused — nothing will be sent.`
> `Location off — showing popular rivers`
> `Hazards unavailable — this river may have hazards that are not shown.`

State on the left, consequence on the right, one line, sized for a table row, a
map callout, a chip, or a lock-screen notification title. That is not breathless
prose; it is the most systematic thing in the app's copy. Splitting each into two
sentences makes them read slower in exactly the places they are read fastest, and
several of these surfaces are single-line and would truncate.

Accordingly the shape is **sanctioned**, not merely tolerated:

> **The status-line pattern.** In a short, single-line string pairing a state
> with its consequence, an em dash is the correct separator. Do not split it into
> two sentences, and do not substitute a colon.

Naming it is the point of this document. An unnamed pattern gets re-litigated; a
named one does not.

## What argued for the rule, and what became of it

The three clearest cases the earlier draft cited were:

| Current | Location |
| --- | --- |
| `Everything still works — your favorites are kept on this device.` | `app/(tabs)/profile.tsx:265` |
| `Conditions unavailable — pull to refresh` | `app/(tabs)/favorites.tsx:343`, `:441` |
| `Forecast is river stage in feet — this river is rated in cfs.` | `src/components/EddyTake.tsx:345` |

The first is slated for rewrite in the main plan for **accuracy** — Editorial
principle 7, state what remains rather than saying "everything else still works."
That rewrite stands on its own and happens not to use a dash. The second and
third are the sanctioned status-line pattern and stay.

The arguments against the rule are unchanged and still hold:

1. **No repo document establishes it.** The rule was asserted as an editorial
   principle in the first revision of the copy plan and then enforced against
   ~50 sites by that same document.

2. **Em dashes are visibly the house voice** — including in the shipped Premium
   strings the same plan explicitly wants to preserve (`premiumCopy.ts:64`,
   `:69`, `:80`, `:119`).

3. **The cost is concentrated in low-value edits** against copy that six existing
   test suites already pin.

## The carve-out that was extracted

One item in the original scope was never a style question. The missing-value
glyph — a bare `—` standing in for an absent value — is announced by VoiceOver as
"dash" or skipped outright, so a screen-reader user gets nothing where a sighted
user sees "unavailable." The original draft correctly flagged that it "needs an
accessibility check before any change rather than a substitution."

Both sites are fixed:

- `src/components/EddyTake.tsx` — the forecast cell has no neighbouring text
  carrying its meaning, so it takes `accessibilityLabel="No forecast"`.
- `app/storage.tsx` — the cache total sits beside a note that already reads
  "Measuring…", so the glyph is decorative until a real size exists and is hidden
  from the accessibility tree.

## If this is ever reopened

The feasibility blocker is gone. The earlier draft noted that a usable lint must
exclude `//` and `/* */` comments including JSDoc, `──` box-drawing runs, en-dash
numeric ranges, and the missing-value glyph — and that "as long as copy lives
inline in screens rather than in `*Copy.ts` modules, the lint has to parse JSX,
which is the main reason to move copy into modules first."

That machinery now exists in `voice-copy.test.ts` and runs clean over
`eddy-ios/app` and `eddy-ios/src` with no false positives. Adding the remaining
exclusions is a small change to a proven pass. The reason not to adopt the rule
is that it is wrong, not that it is expensive.
