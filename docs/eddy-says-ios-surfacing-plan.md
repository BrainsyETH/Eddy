# Eddy Says on iOS: the per-river summary is free, the per-river quote is gated

The iOS app has never shown a river's "Eddy Says" quote. It downloads one for
every river on the Today tab and keeps a single key out of the response. The one
place a full quote does reach an iOS screen, it arrives through a different
endpoint under a different name and is blurred behind the paywall.

This plan puts Eddy's voice on the screens that were missing it. It changes no
server gate and no web page.

> **Measured baseline — 2026-08-23**, from `eddy_updates` on the linked project.
> 353 per-river rows in the retained window (2026-08-19 onward), 80 of them
> live. **Every per-river row has both `summary_text` and `eddy_read`
> populated; there are no nulls.** The 5 statewide rows have neither. These
> counts decide W6 below.

## Contents

- [The rule](#the-rule)
- [The artifact: one model call, three blocks](#the-artifact-one-model-call-three-blocks)
- [Where iOS stands today](#where-ios-stands-today)
- [The constraint that shapes everything](#the-constraint-that-shapes-everything)
- [The divergence this creates, on purpose](#the-divergence-this-creates-on-purpose)
- [Workstreams](#workstreams)
- [Sequencing](#sequencing)
- [Validation](#validation)
- [What this plan does not do](#what-this-plan-does-not-do)
- [Open decisions](#open-decisions)

## The rule

Stated precisely, because the obvious phrasing — "`quote_text` is paid on iOS" —
is false:

> **Per-river `summary_text` is free. Per-river `quote_text` is gated on iOS.
> The statewide `global.quoteText` is a separate free overview and stays free.**

The exception is not a carve-out, it is structural. `insertGlobal` in
`src/app/api/cron/generate-eddy-updates/route.ts:207` writes `quote_text` and
nothing else — `generateGlobalUpdate` returns a single text block, so the
statewide row **has no `summary_text` to be the free tier of.** All 5 statewide
rows in the table confirm it. `TodaySummary` renders `global.quoteText` free
today and must keep doing so; a rule written over the whole column would have
made the Today tab's headline card illegal by accident.

The two artifacts are also different lengths — the statewide one is two or three
sentences of overview, the per-river `[FULL]` block is four to six sentences of
detail — so they were never one thing being tiered two ways.

## The artifact: one model call, three blocks

`src/lib/eddy/generate-update.ts` makes a single model call whose output is
parsed by `src/lib/eddy/parse-response.ts` into three columns of `eddy_updates`.
The prompt specifies each block's job and length:

| Block | Column | Spec, from the prompt | Tier |
| --- | --- | --- | --- |
| `[SUMMARY]` | `summary_text` | "A single sentence, under 120 characters. This is for share cards and compact views." | **Free** |
| `[EDDY_READ]` | `eddy_read` | "One or two concise sentences, under 240 characters total… an experienced outfitter's read." | Not used by this plan — see W6 |
| `[FULL]` | `quote_text` | "4-6 sentences with details, trends, and context." | **Gated on iOS** |

The full quote reaches clients three ways, and the third is the one that matters:

| Endpoint | Serves | Called by |
| --- | --- | --- |
| `/api/eddy-updates` | `quoteText` + `summaryText` for every river, plus `global` | iOS Today tab, web home |
| `/api/eddy-update/[riverSlug]` | the same, plus `eddyRead` | web river pages |
| `/api/rivers/[slug]/outlook` → `fullRead` | **the same `quote_text` column** | iOS `EddyTake` |

`outlook/route.ts:493` sets `fullRead = overlaid?.quote_text`, under the same
`overlayLiveConditions` guard the public endpoints apply. The blurred paragraph
under "EDDY'S READ" on iOS and the paragraph eddy.guide prints in full are one
string.

## Where iOS stands today

| Surface | Shows | Note |
| --- | --- | --- |
| `TodaySummary.tsx:171` (Today tab) | the **statewide** `quoteText`, folded | free, and stays free — see [the rule](#the-rule); wired at `reports.tsx:1062` |
| `RiverReaches.tsx:132` (river screen) | `summaryText \|\| quoteText` per reach | prefers the short one, no expander |
| `EddyTake.tsx:298` (river + gauge screens) | `outlook.fullRead \|\| sections?.eddyRead` | this *is* the per-river full quote, blurred for non-subscribers |
| everywhere else | nothing | — |

And the payload the app already holds:

```
// eddy-ios/app/(tabs)/reports.tsx:391
void fetchEddyUpdates(signal)
  .then((updates) => setSummary(updates.global ?? null))
```

`fetchEddyUpdates` resolves to `Record<slug, EddyUpdateEntry>` for all 24 rivers
— one batched, CDN-cached, unauthenticated request. `updates.global` is the only
key any code reads. Every per-river surface below is therefore free in network
terms; the data is already on the device.

## The constraint that shapes everything

**There is no consumer session on the web.** The only login route in the app is
`src/app/api/admin/login`; `requireUser` in `src/lib/supabase/request.ts:58` is
Bearer-token auth, and the entitlement it reads is written by the RevenueCat
webhook against a subscription bought in the iOS app. No web page checks
entitlement, because no web visitor has one.

So "gated" can only mean **an in-app presentation tier**. It cannot mean the
string becomes unavailable, and the plan must not pretend otherwise:

- `/api/eddy-updates` and `/api/eddy-update/[riverSlug]` stay public and keep
  serving `quoteText`. Removing it would break the web river pages,
  `MapEddySays`, `RiverCard` and everything else downstream of
  `useEddyUpdates`, and would strip both routes' `withX402Route` offering — to
  hide a string the same server prints on eddy.guide.
- It would not even make the string private. `src/app/api/og/social/route.tsx`
  selects `summary_text, quote_text` from `eddy_updates` directly, and
  Remotion's social props carry a `quoteText` of their own, so the prose reaches
  public OG cards and rendered video without passing through either endpoint.
- `EddyTake`'s own header already says this of the blur: *"It is NOT a security
  boundary and never was — the text is in the payload either way."* The tier
  here is the same kind of thing, and is defensible on the same grounds.

What is actually being sold on iOS is unchanged: Eddy's long-form writing, the
72-hour strip's interpretation, the weather section and the bottom line. What
changes is that a non-subscriber stops seeing a river screen with no Eddy voice
on it at all.

## The divergence this creates, on purpose

After this plan, eddy.guide prints the per-river full quote free while the iOS
app shows the summary free and the full quote behind the gate. That is a
deliberate asymmetry with a reason — one platform has a payment path and the
other has none — and it should be recorded so a later parity pass does not
"correct" it.

`src/lib/eddy-read-parity.test.ts` is untouched by this. It asserts that
`EddyTake` prefers `fullRead` over `sections.eddyRead` and that
`RiverGaugeDetail` prefers `quoteText` over `eddyRead` — both remain true. The
new free surface is a different slot on a different tier, and W7 is what keeps
it from drifting into the paid one.

## Workstreams

### W1 — One in-memory source for the batched updates, with a stated contract

Prerequisite for everything below. Today the batched call has exactly one call
site and one consumer, and two of the traps below are already latent in it.

Add `eddy-ios/src/hooks/useEddyUpdates.ts`, mirroring the web hook's name
(`missouri-float-planner/src/hooks/useEddyUpdates.ts`) so the two are findable
together. It is a module-level cache, and a module-level cache without a written
contract is a bug generator. The contract:

1. **The shared request owns its own lifecycle.** `fetchEddyUpdates(signal)`
   takes an `AbortSignal`, and `reports.tsx:494-498` creates a controller and
   **aborts it on unmount**. Hand that signal to a shared promise and leaving
   the Today tab kills the request for every other consumer awaiting it. The
   shared fetch must therefore create its own controller, or pass none at all.
2. **Callers unsubscribe locally.** A component that unmounts stops listening;
   it never aborts the shared fetch.
3. **Rejected promises are evicted immediately.** Otherwise one failure poisons
   the cache for the whole TTL and every later consumer replays the same error
   without a request.
4. **Pull-to-refresh invalidates, then revalidates.** `reports.tsx:500-504`
   calls `load()` with no signal on refresh. Against a TTL cache that becomes a
   pull-to-refresh that returns the cached paragraph and never contacts the
   server — a refresh control that refreshes nothing.
5. **The TTL cannot exceed the endpoint's freshness policy.** The route sets
   `cdnCacheHeaders(300, 1800)` (`eddy-updates/route.ts:168`), so the client TTL
   ceiling is 300s. Longer, and the app is staler than the CDN it is reading.

Repoint `reports.tsx` at the hook; its behaviour does not change.

**Never persist it.** `riverCache.ts` excludes Eddy's take, and
`reports.tsx:294-301` gives the reason the prose is never stored across
launches: `gateGlobalProse` and `overlayLiveConditions` are *live* checks, and a
stored paragraph about yesterday's water is precisely what they exist to
suppress. A disk cache would defeat the server-side gate silently.

Put the selection logic in a pure module under `eddy-ios/src/lib/`, not in the
hook — see W7. The web suite covers iOS pure logic and is where its tests run.

### W2 — One "Eddy Says" section on the river screen: free deck, gated body

The gap that matters most: `app/river/[slug].tsx` goes reading card →
`RiverReaches` → `EddyTake`, and Eddy never speaks about *this river* unless you
subscribe.

**Not a second card.** The prompt instructs the model to *"state the condition
clearly in the first sentence of both the summary and the full text"*, so a
standalone free card above `EddyTake` would put two apparently independent cards
on screen repeating the same verdict about 200pt apart. Instead the summary
becomes the **always-visible deck of the existing section**, with the gated read
as its body:

- One heading. The summary sits under it, sharp, at every entitlement state.
  The `EDDY'S READ` body below is unchanged — full quote for subscribers,
  blurred for everyone else, one lock for three sections.
- They may stay separate components internally; what matters is that they read
  as one section with a deck and a body, which is the newspaper arrangement and
  reads as deliberate rather than duplicated.
- **This preserves the `'pending'` behaviour that already exists.** The deck is
  free, so it renders immediately and never depends on entitlement; only the
  body below it branches on `entitled`. Nothing paints and then vanishes when
  `/api/me/profile` lands, which is the flash `EddyTake`'s three-state
  `entitled` prop was written to prevent.
- The written-age footnote from `generatedAt` stays required, for the reason
  `TodaySummary`'s header gives: every other number on the screen is minutes old
  and this sentence is hours old.

### W3 — Favorites gets the prose back, at one request

`favorites.tsx:24-33` records why the prose was removed: the screen fanned out
one `/api/rivers/[slug]/outlook` per starred river, with batching, an epoch
counter and an answered-slug ref to keep that from opening twenty sockets on one
bar of LTE. **`/api/eddy-updates` is a single call carrying an entry for every
river**, so the reason no longer applies.

- Add the summary line to `FavoriteRiverCard`.
- Update that header comment. It currently signs off with "The prose still
  exists on the river screen, one tap away" — true only for subscribers today,
  and true for everyone after W2.

### W4 — The map river sheet needs a reader that never fetches

`RiverSheet`'s header states its rule: *"No request is made here… Tapping a
river is the cheapest interaction on this screen and it should stay that way."*

A conventional `useEddyUpdates()` mounted in `RiverSheet` **breaks that rule** —
on a cold open of the Map tab the cache is empty and tapping a river would fire
a request. The hook therefore needs two distinct entry points:

```
useEddyUpdates()            // initiates and revalidates. Today tab, river screen.
useCachedEddyUpdate(slug)   // subscribes and reads. Never initiates.
```

`useCachedEddyUpdate` must **subscribe** to the cache, not peek at it once. A
one-time read returns nothing when the sheet opens before the Today tab's fetch
lands, and would then stay blank for the life of the sheet even though the data
arrived a moment later. Subscribing means the line appears when the data does,
and the sheet still never asks for it.

### W5 — Share carries the summary, on the river screen only

`ShareButton` is shared by three screens — river, gauge, and access point — so
this must not be a change to the component's default behaviour.

- **Scope:** the river screen's `ShareButton` only. Gauge and access-point
  shares are unchanged.
- **Composition:** the existing title and canonical path, plus the river's
  summary line when there is one.
- **Null behaviour:** no summary, no change — the share is exactly what it is
  today. The prose is an addition, never a precondition.
- **Never the full quote.** Web's `EddyQuote.tsx:98` shares
  `summaryText || quoteText`; iOS must not inherit that fallback, or the one
  control designed to send things to other people becomes the way the gated
  artifact leaves the app. The summary is also the block the prompt describes as
  "for share cards and compact views", under 120 characters — it is the right
  string on its own merits.

### W6 — Dropped: the `eddyRead` fallback rescues nothing

An earlier draft proposed adding `eddyRead` to `/api/eddy-updates` as a fallback
for rivers whose `summary_text` is null. **That does not work, and the data says
it is not needed.**

It does not work because of how the parser fails. Every path in
`parse-response.ts` that yields a null summary yields a null `eddyRead` in the
same object — the terminal case returns
`{ summaryText: null, eddyRead: null, quoteText: rawText }`. The two fields fail
together by construction, so the population the fallback was written for —
`summary_text IS NULL AND eddy_read IS NOT NULL` — can barely exist.

The table agrees: of 353 per-river rows, **zero** have a null `summary_text`,
and therefore zero would be helped. The only rows with nulls are the 5 statewide
ones, which have no summary by design and are exempt under
[the rule](#the-rule).

So: **no wire change, no new field, no edit to either hand-mirrored copy of
`EddyUpdateEntry`.** What replaces it:

- **Render nothing** when the summary is null. The deck is absent, the section
  keeps its body, and nothing claims Eddy said something he did not.
- **Never fall back to `quote_text` there.** On that path `quote_text` is *raw
  model output* — unparsed, and possibly still carrying `[SUMMARY]`/`[FULL]`
  markers, which is why `stripEddyMarkers` exists. It is both the gated artifact
  and the low-quality one.
- **Treat a null summary as a generation defect, not a rendering case.**
  `parse-response.ts` already logs `"Could not extract summary from model
  output"`. The fix is regeneration at the source; if the population ever stops
  being zero, that warning is the signal, not the wire format.

The `EddyUpdateEntry` mirror test the earlier draft bundled here is still worth
having — the two copies are maintained by hand and, unlike `dam-catalog-parity`
and `service-tier-parity`, have no test — but it is now independent of this plan
rather than a prerequisite of it.

### W7 — The invariant belongs in a typed selector, not in a grep

The tier is only as strong as the narrowest thing that can produce the string.

- **Primary invariant — a pure, tested selector.** One function, in the pure
  module from W1, returning `summaryText ?? null` and structurally unable to
  return `quoteText`. This is the unit test that actually holds the rule.
- **The free component takes a narrowed DTO, not an `EddyUpdateEntry`.** Give it
  a selected string (plus `generatedAt` and `conditionCode` if it needs them) —
  a shape with no `quoteText` field at all. A source assertion over the
  component would pass happily if some other layer handed it a `quoteText`
  already renamed to `text`; a type that cannot carry the full quote closes that
  path instead of policing it.
- **Source assertion, secondary.** Keep one in the web suite beside
  `eddy-read-parity.test.ts` as a cheap backstop, but do not let it be the only
  thing standing between the free surface and the gated column.
- **Record the divergence** — this document, plus a line in the component's
  header saying the web prints the full quote and iOS does not, and why.

## Sequencing

1. **W1** — the hook, both entry points, the contract. Nothing else can start.
2. **W7's selector** — written with W1's pure module, before any surface
   consumes it.
3. **W2** — the river screen. The gap that motivated this.
4. **W3, W4, W5** — independent of each other, any order.

W6 is dropped; nothing depends on it.

## Validation

- `make check-web` — web typecheck, lint and tests, **including the iOS pure
  logic** from W1 and the selector test from W7.
- `make check-mobile` — iOS typecheck and lint.
- `make bundle-mobile` — the production bundle plus the `.easignore` allowlist
  check, which is what catches Metro breakage invisible in dev.

No migration, no schema change and no wire change, so `make check-db` is not in
scope. Every column this plan reads already exists and is already populated.

## What this plan does not do

- **Does not remove `quoteText` from the public endpoints.** See
  [the constraint](#the-constraint-that-shapes-everything).
- **Does not change the wire format.** W6 is dropped.
- **Does not change what the Today tab shows.** The statewide overview stays
  free and unfolded exactly as it is.
- **Does not cache prose to disk.** The server's gate is a live check.
- **Does not change the web.** No web component, page or route changes.
- **Does not change the paywall gate.** `EddyTake` keeps `fullRead`, keeps the
  blur, keeps one lock for three sections.

## Open decisions

1. **Where the deck sits relative to the `EDDY'S TAKE` heading** (W2) — inside
   the existing card as its first element, or immediately above it as a
   headline. Worth looking at a real river's summary and full quote side by side
   before committing; the measured baseline says both strings are always
   present, so there is no empty state to design around first.
2. **Whether `useCachedEddyUpdate` should also serve the river screen** (W4) —
   the river screen can afford to initiate, but if the Today tab has almost
   always run first, the simpler wiring may be to let the river screen
   revalidate and everything else subscribe.
3. **Whether the web should follow to summary-first** — recommended no. With no
   consumer session there is nothing to unlock the full quote with, so a web
   summary tier would hide the text from everyone rather than tier it.
