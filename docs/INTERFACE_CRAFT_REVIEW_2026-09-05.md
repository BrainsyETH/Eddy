# Interface Craft (Josh Puckett) — review and takeaways for Eddy

**Date:** 2026-09-05
**Subject:** [interfacecraft.dev](https://www.interfacecraft.dev/) — "a working library for
those committed to designing with uncommon care," by Josh Puckett (Dropbox, Wealthfront;
author of [DialKit](https://www.dialkit.dev/) and [Pica](https://pica.joshpuckett.me/)).

## 0. Scope of this review — read this first

The library is **paywalled** ($249, lifetime access). This review is based on everything
publicly reachable, not on the 40+ member articles:

| Reviewed | Not reviewed |
| --- | --- |
| The full [library update log](https://www.interfacecraft.dev/updates) (structure, collections, release history) | The 11 *Means & Methods* chapters (100+ topics) |
| The free preview walkthrough [*Refining a Task App Interface*](https://www.interfacecraft.dev/refining-today) — read in full | The *Interface Kit* collection and framework |
| The published Interface Craft **skill file** documentation (redistributed on skill marketplaces) | The video walkthroughs (*Compound Motion*, *Using DialKit Timeline*, *Designing Gifting*) |
| DialKit's public docs and API | The article *Animations as Proof of Care* |
| Puckett's talks — [Dive Club](https://www.dive.club/deep-dives/josh-puckett), [UX Tools](https://www.uxtools.co/episodes/design-has-never-been-more-in-demand-so-why-cant-juniors-get-hired) — and his essays | Practical Demonstrations 1–3 |

So: the **method** is well-established from public sources; the **specific technique
inventory** is not. Where I state a principle below, it is sourced. Where I apply it to
Eddy, the evidence is our own code, cited by path and line.

If we want the technique inventory, $249 is a rounding error against the engineering hours
this document proposes. I'd buy it before executing §3.

---

## 1. What the library actually is

Structurally it is four things, not a course:

1. **Means & Methods** — 11 chapters, 100+ techniques, with interactive figures and code.
   This is the reference core.
2. **Interface Kit** — a component/pattern collection plus an installable framework.
3. **Practical Demonstrations** — long-form redesign walkthroughs (*Refining Today*,
   *Designing Library Cards*, *Redesigning a Mobile Web App* pts 1–3). Keyboard-navigable
   with `j`/`k`.
4. **Skill files + tools** — agent skills (Storyboard Animation, DialKit, Design Critique)
   and DialKit itself, a live-tuning control panel for React.

That last category is the part most relevant to how we already work: Puckett ships his
methodology as **executable agent skills**, not just prose. His stated one-liner for the
skill bundle is *"Write motion like a script, tune values live, critique with specificity,
explore conceptual range, then push depth with uncommon care."*

## 2. The method, in six moves

**1. Craft is a variance-reduction exercise, not an addition exercise.**
The free *Refining Today* walkthrough is the clearest artifact of his method. Every one of
the eight refinements he makes is a **subtraction or an alignment**, never an embellishment:
one icon style instead of two (filled plus vs. outline everything else); four competing
implicit vertical rules reduced to two; the toolbar's container and hairline outline deleted
because they "lacked precedent elsewhere in the interface's visual language"; dividers made
consistent and then removed entirely; stroke widths and colors aligned because "we have too
much color variance going on"; padding tightened to feel "optically balanced." His summary:
reduce visual weight, unify the visual language, make it feel native to the platform.

**2. "Optically," not "mathematically."** Recurring vocabulary — optical alignment, optical
balance. Equal numbers are the starting point, not the answer.

**3. Motion is evidence of care, and it is compound.** Two of his article/video titles are
literally *Animations as Proof of Care* and *Compound Motion* ("layering animation
properties for richer results"). Motion is choreography of a state change, not decoration
bolted onto entrances.

**4. Tune by feel, with instruments.** DialKit exists because "edit → save → reload" is too
slow a loop to find a value you can only recognize when you feel it. You wire `useDialKit`
into the parameters you're unsure about and move sliders until it's right.

**5. Critique is a repeatable framework, not an opinion.** The Design Critique skill is
"systematic UI review based on Josh Puckett's methodology" — capturing feedback against
*measurable goals*. Critique with specificity; findings, not vibes.

**6. Product design is not art.** From the UX Tools interview: the bar is *demonstrable*
improvement ("you have to demonstrate high slope"), and he names **"phantom competency"** —
looking capable without depth. The chef who cooks one new dish a week should reconsider the
career. Craft is reps.

One more thing worth naming: the library's own onboarding is its argument. It's the most
praised thing about it — replayable, with commissioned custom sounds. The product
demonstrates its thesis before it states it.

---

## 3. Takeaways for Eddy

Eddy's design system is genuinely above average — `.stitch/DESIGN.md` is a real design
system of record, the palette is documented down to *why* the neutrals are warm, and
`eddy-ios/src/theme/typography.ts` explains that mono is functional (tabular digits hold
still while a gauge reading changes) rather than decorative. That comment is exactly the
kind of reasoning Interface Craft teaches.

The gap is not the system. **The gap is that the system is written down and not wired up.**
That is what the audit below found, over and over.

### 3.1 We have two parallel design systems, and the good one is the one nobody calls — **highest leverage**

This is the root finding. Everything in §3.4 and §3.6 is a symptom of it.

`DESIGN.md` §7 specifies durations, three named curves, and reduced-motion behavior.
`globals.css:126–131` defines them as tokens. `tailwind.config.ts` defines
`duration-fast|normal|slow|slower`. And the tokens **are** used properly — `var(--duration-*)`
26 times and `var(--ease-*)` 27 times — but every one of those uses is *inside `globals.css`
itself*, in the `.btn-*`, `.card`, and `.badge-*` class definitions.

Measured across `missouri-float-planner/src`:

| Token | Uses in `globals.css` | Uses in `.tsx` components |
| --- | --- | --- |
| `var(--duration-fast\|normal\|slow)` | 26 | **0** |
| `var(--ease-default\|out\|bounce)` | 27 | **0** |
| Tailwind `duration-fast\|normal\|slow\|slower` | — | **0** |

So we have a coherent, tokenized CSS layer — and a component layer that bypasses it
entirely. What components use instead: `duration-200` ×9, `duration-300` ×5, `duration-500`
×4, `duration-150` ×4, plus hand-written `cubic-bezier(0.4,0,0.2,1)` inline at
`MOMap.tsx:784,1187,1216`, `TimeScrubber.tsx:81`, `rail.tsx:351`, `Dock.tsx:262,403`, and a
one-off `cubic-bezier(0.22,1,0.36,1)` at `FloatPlanCard.tsx:1328` — across durations of
220, 260, 380, 600, and 1200 ms.

This is *Refining Today*'s "too much variance" finding, in the time dimension. A user can't
name it, but nothing in the app moves like anything else in the app — and the fix was
already written, then routed around.

**Action:** the token layer doesn't need to be built, it needs to be *reached* (§3.4). In
parallel: extend the duration scale honestly — the real range in use needs steps slower than
100/200/300 — then migrate the inline values and add a lint rule against raw
`duration-[0-9]+` and inline `cubic-bezier` under `src/components`. Mechanical, low-risk,
and the single change that would most make the app feel like one product.

### 3.2 The iOS app has no haptics at all

`expo-haptics` is **not a dependency**, and there are zero haptic call sites across 100
`.tsx` files.

For a phone app whose primary interaction is a **draggable map sheet with detents** —
`SETTLE_SPRING` in `map-sheet/sheetGeometry.ts:47`, `PAGE_SPRING` in
`map-sheet/SheetPager.tsx:50` — this is the most conspicuous "proof of care" gap we have.
On iOS, a sheet that snaps to a detent in silence reads as a web view. The spring work is
already done and it's good; the tactile half of it is simply absent.

**Action:** add `expo-haptics` and a small semantic module (`src/theme/haptics.ts`, next to
`palette.ts` — see §3.5) with three or four named events, not raw calls:

- `selection()` — sheet page change, tab change, segment change
- `settle()` — light impact when the sheet lands on a detent
- `crossing()` — notification-warning when a reading crosses into a hazard zone

Route every call through that module so the vocabulary stays small and the system
accessibility setting is honored in one place.

### 3.3 Eddy's core number doesn't move when it changes

`CurrentReadingCard.tsx` is good work — mono + `tabular-nums`, an `aria-live="polite"`
screen-reader line, the non-primary unit dropped to `opacity-70`, a zone ladder with
neighbor labels. But:

- The zone marker (`CurrentReadingCard.tsx:201–202`) positions with `left: ${markerPercent}%`
  and **no transition**. On refresh it teleports.
- The digits swap instantly. Nothing tells you the number just changed.

Eddy's entire job is showing a number that changes and saying what it means. Puckett's
*Animations as Proof of Care* thesis applies here more directly than to any other surface
we own: motion should **carry** a state change so the eye can follow it, especially when
the change is the product.

**Action:** transition the marker's `left` on the standard token; treat a value change as a
choreographed transition (a brief tint or a count-up, not a bounce). Gate on
`prefers-reduced-motion` — we already respect it in 8 places, so the plumbing exists.

### 3.4 The design system exists in CSS but not in the components

This is §3.1's root cause, stated concretely.

`globals.css` fully specifies `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`
(lines 395–533) with hover, active, `:focus-visible`, and `:disabled` states, plus `.card`
(534) and ten `.badge-*` variants (621–687). `DESIGN.md` §4 documents all of it in tables.
These classes are where the motion tokens actually get used.

Measured:

- `.btn-primary` / `.btn-secondary` used in **2** files.
- **170** bespoke `px-* py-* rounded-*` className blobs across `src/components`.
- `src/components/ui/` contains 16 files — **none of them a primitive**. There is no
  `Button.tsx`, no `Card.tsx`, no `Badge.tsx`. `ReportIssueButton.tsx` is a feature, not a
  primitive.

So the carefully-specified interaction states — including focus-visible, which only 7 files
use at all — are written once and reached almost never. Meanwhile `focus:ring`/`focus:outline`
appears in 27 files, i.e. a second, older focus vocabulary running in parallel.

**Action:** build the three primitives in `src/components/ui/` as the only sanctioned way to
render a button, card, or badge, implemented **on the existing CSS classes** so there's no
visual change on day one. Every component that adopts one instantly inherits the motion
tokens, the focus-visible state, and the disabled state for free — which is why this is the
structural fix. It makes §3.1 and every future refinement land everywhere at once instead of
in 170 places.

### 3.5 Motion has no home in the iOS theme

`eddy-ios/src/theme/` holds `palette.ts`, `typography.ts`, `conditions.ts`, `flow.ts`,
`floodStage.ts` — and no `motion.ts`. The spring constants live inside
`components/map-sheet/`, reachable only by the sheet.

Those files are exemplary: `palette.ts` opens with a 20-line comment naming its single
deliberate divergence from `DESIGN.md`, why it exists, which ADR records it, and the rule
that "a divergence recorded on only one side of a border is indistinguishable from drift."
Motion deserves that same treatment and doesn't have it.

**Action:** `src/theme/motion.ts` alongside `palette.ts`, exporting the named springs and
durations, with the same header discipline. Then `DESIGN.md` §7 grows a cross-platform
section: web easing curves and their native spring equivalents, stated as one system.

### 3.6 Loading is three vocabularies at once

42 `animate-spin` uses; `LoadingSpinner` referenced in 11 files; 8 files mentioning
skeletons; 16 using `animate-pulse`. The `shimmer` keyframe is defined in
`tailwind.config.ts` and `DESIGN.md` assigns it to "skeleton loader sweep."

For a data app, layout is knowable before data arrives — gauge cards, river rows and access
lists all have a fixed shape. A skeleton in the final layout is both faster-feeling and
honest about what's coming; a spinner discards information we already have.

**Action:** pick one. Skeletons for anything whose shape is known, spinner reserved for
genuinely indeterminate work. Retire the third vocabulary.

### 3.7 First run and the paywall have zero motion and zero haptics

`FirstRunPicker.tsx` (483 lines), `OnboardingGate.tsx` (168), and `PaywallSheet.tsx` (838) —
**1,489 lines** — contain no `Animated`, no `withSpring`/`withTiming`, no `FadeIn`, no
`LayoutAnimation`, and (per §3.2) no haptics.

These are the two moments that set the product's tone and the one that converts revenue.
Interface Craft's own onboarding is the most-praised thing about the library, and that is
not a coincidence — it's the thesis demonstrated before it's stated. Eddy sells *trust in a
number*; first run is where that trust is either established or not.

**Action:** treat first run and the paywall as the flagship motion surfaces, after §3.1 and
§3.2 give us the vocabulary to build them from. Storyboard the sequence before implementing
it, per Puckett's "write motion like a script."

### 3.8 Turn our audits into a re-runnable skill

We already write excellent dated reviews — `IOS_UX_FLOW_REVIEW_2026-08-27.md`,
`MAPS_SHEET_UX_BRAND_AUDIT_2026-08-05.md`. They are prose findings, which means they're
read once and go stale. Puckett ships his critique methodology as a **skill file**.

**Action:** encode Eddy's craft checklist as `.claude/skills/interface-review/` — condition
color fidelity against `CONDITION_SYSTEM`, tabular numerics on every changing value, motion
tokens only, reduced-motion parity, hit areas, haptic parity between gesture surfaces, focus
vocabulary. Then a craft review is a command, not a project. This is the highest-ROI item
per hour for a small team, and it makes every item above self-enforcing.

### 3.9 Adopt live tuning for the values we can only pick by feel

Our spring constants, the flow-particle layer, and the map sheet detents were presumably
tuned by edit-and-reload. DialKit's model — `useDialKit` controls in a dev-only panel — is
worth copying for exactly those parameters.

**Action:** lower priority than the rest, but if we do §3.1 and §3.5, do this first so the
values we standardize on are ones we actually chose rather than ones that survived.

---

## 4. Suggested order

Sequenced so each step makes the next cheaper:

1. **§3.8 the review skill** — cheapest, and it makes everything below self-enforcing.
2. **§3.4 UI primitives** — the structural fix, and the one that makes the existing token
   layer reachable. Do this before the migration work, not after.
3. **§3.2 haptics** — small, self-contained, and the largest perceived-quality jump per line
   of code we can buy. Independent of the web work, so it can run in parallel.
4. **§3.1 motion-token migration** (web) + **§3.5 `theme/motion.ts`** (iOS) — one motion
   vocabulary across both apps, now that there's somewhere for it to live.
5. **§3.3 the reading transition** — our signature surface, once the tokens are reachable.
6. **§3.6 loading vocabulary**, then **§3.7 first run / paywall**, then **§3.9 DialKit**.

## 5. The honest summary

Interface Craft's central claim is that the difference between good and exceptional is not
talent or ideas, it's **variance** — the same icon style everywhere, the same rhythm
everywhere, the same curve everywhere, and motion that carries every state change rather
than decorating a few.

By that standard Eddy's problem is not that we lack a design system. We have an unusually
well-reasoned one, and — the genuine surprise of this audit — it is correctly implemented in
CSS, tokens and all. The problem is that the component tree doesn't call it: button styles
used in 2 files against 170 hand-rolled alternatives, motion tokens with 53 uses inside
`globals.css` and 0 outside it, a native app with no haptics, 1,489 lines of first-run and
paywall with no motion at all, and a signature number that teleports.

None of that requires new design. It requires reaching the design we already built.

---

## Sources

- [Interface Craft](https://www.interfacecraft.dev/) — library home
- [Library Updates](https://www.interfacecraft.dev/updates) — structure and release log
- [Refining a Task App Interface](https://www.interfacecraft.dev/refining-today) — free walkthrough, read in full
- [DialKit](https://www.dialkit.dev/) — live-tuning tool
- [Josh Puckett](https://joshpuckett.me/) — projects and essays
- [Dive Club — Crafting interfaces with uncommon care](https://www.dive.club/deep-dives/josh-puckett)
- [UX Tools — Design Has Never Been More in Demand](https://www.uxtools.co/episodes/design-has-never-been-more-in-demand-so-why-cant-juniors-get-hired)
- Interface Craft skill documentation, [LobeHub Skills Marketplace](https://lobehub.com/skills/jscraik-agent-skills-interface-craft)
