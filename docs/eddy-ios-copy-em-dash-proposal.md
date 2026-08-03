# Em dashes in user-visible copy — proposal, decision pending

**Status: not decided. Do not implement.**

This was Priority 5.1 of `docs/eddy-ios-copy-improvement-plan.md`. It is split out
because it is a brand-voice decision, not an accuracy fix, and because it is the
single largest workstream in that plan. Keeping it here lets the accuracy work
ship without waiting on a style debate.

## The question

Should user-visible prose in the iOS app avoid em dashes?

## What argues for the rule

Em-dash-heavy copy can read as breathless, and several current strings stack an
em dash onto a sentence that would be clearer as two. The clearest cases are ones
where the dash joins two complete thoughts that have no real relationship:

| Current | Location |
| --- | --- |
| `Everything still works — your favorites are kept on this device.` | `app/(tabs)/profile.tsx:265` |
| `Conditions unavailable — pull to refresh` | `app/(tabs)/favorites.tsx:343`, `:441` |
| `Forecast is river stage in feet — this river is rated in cfs.` | `src/components/EddyTake.tsx:260` |

All three are already slated for rewrite in the main plan for **accuracy**
reasons (sections 3.3, 5.1, and 5.1 respectively), and their replacements happen
not to use em dashes. So a meaningful share of the visible dashes disappear
whether or not this rule is adopted.

## What argues against it

1. **No repo document establishes it.** There is no voice or tone guide in
   `docs/`. The rule was asserted as an editorial principle in the first revision
   of the copy plan and then enforced against ~50 sites by that same document.

2. **Em dashes are visibly the house voice.** They appear in the shipped Premium
   strings that the same plan explicitly wants to preserve:

   - `premiumCopy.ts:64` — "The full written report — what the water is doing…"
   - `premiumCopy.ts:69` — "Not a weather app — the rain, the heat and the river trend…"
   - `premiumCopy.ts:80` — "Your subscription pays for the servers and river data everyone here uses — subscribers and not."
   - `premiumCopy.ts:119` — "…are always free — and the last ones you saw stay on your phone…"

   Section 2.2 of the main plan rewrites some of these for overclaiming. That is
   a separate reason, and those rewrites stand whether or not dashes are banned.

3. **The cost is concentrated in low-value edits.** Once the accuracy-driven
   rewrites land, the remainder are dashes doing legitimate work — apposition and
   short interruptions — where a period or colon is a lateral move at best.

## If the rule is adopted

### Scope

User-visible strings and JSX text nodes only. Explicitly out of scope:

- developer comments, including the `── section ──` box-drawing rules used
  throughout this codebase's module headers;
- en-dash ranges such as `20–75 minutes`;
- data-derived prose from an external agency (NWS, USGS, NPS), which is quoted
  and must not be paraphrased — see the header of `app/gauge/[siteId].tsx`;
- `—` used as a missing-value glyph, which needs an accessibility check before
  any change rather than a substitution.

### Transformations

- Two complete ideas: use a period.
- An explanation: use a colon.
- A short interruption: rewrite the sentence.
- A missing value shown as `—`: use "Unavailable" visually, or provide a clear
  accessibility label.

### Lint

A naive `grep` for `—` returns over 1,500 hits across `eddy-ios/app` and
`eddy-ios/src`, the overwhelming majority in comments. A usable lint has to
exclude, at minimum:

- `//` line comments and `/* */` blocks, including JSDoc;
- `──` box-drawing runs;
- string literals matching an en-dash numeric range;
- the missing-value glyph, ideally by requiring it to be a standalone token.

Build it against the existing pattern in
`missouri-float-planner/src/lib/*-copy.test.ts` rather than as a new harness, and
land it **before** the manual pass so its acceptance criterion is checkable while
the work is in progress. As long as copy lives inline in screens rather than in
`*Copy.ts` modules, the lint has to parse JSX, which is the main reason to move
copy into modules first.

### Estimated scope after the accuracy work

Unknown, and worth measuring before committing. The first revision of the plan
claimed "more than 50 user-visible" occurrences; that figure was not derived from
a filtered count, and a filtered count is a prerequisite for deciding whether
this is worth doing.

## Recommendation

Measure first. Land the main plan's Priorities 1–4, then re-count the remaining
user-visible dashes. If the residue is small and consists mostly of legitimate
apposition, drop this proposal. If it is large and repetitive, adopt the rule
with the exclusions above.
