# Eddy Says on iOS: the summary is free, the full quote is paid

The iOS app has never shown a river's "Eddy Says" quote. It downloads one for
every river on the Today tab and keeps a single key out of the response. The one
place the full quote does reach an iOS screen, it arrives through a different
endpoint under a different name and is blurred behind the paywall.

This plan puts Eddy's voice on the screens that were missing it, on the tier the
decision above settles: **`summary_text` is free, `quote_text` is paid.** It
changes no server gate and no web page.

## Contents

- [The artifact: one model call, three blocks](#the-artifact-one-model-call-three-blocks)
- [Where iOS stands today](#where-ios-stands-today)
- [The constraint that shapes everything](#the-constraint-that-shapes-everything)
- [The divergence this creates, on purpose](#the-divergence-this-creates-on-purpose)
- [Workstreams](#workstreams)
- [Sequencing](#sequencing)
- [Validation](#validation)
- [What this plan does not do](#what-this-plan-does-not-do)
- [Open decisions](#open-decisions)

## The artifact: one model call, three blocks

`src/lib/eddy/generate-update.ts` makes a single model call whose output is
parsed by `src/lib/eddy/parse-response.ts` into three columns of `eddy_updates`.
The prompt specifies each block's job and length:

| Block | Column | Spec, from the prompt | Tier under this plan |
| --- | --- | --- | --- |
| `[SUMMARY]` | `summary_text` | "A single sentence, under 120 characters. This is for share cards and compact views." | **Free** |
| `[EDDY_READ]` | `eddy_read` | "One or two concise sentences, under 240 characters total… an experienced outfitter's read." | Free, as a fallback only — see W6 |
| `[FULL]` | `quote_text` | "4-6 sentences with details, trends, and context." | **Paid on iOS** |

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
| `TodaySummary.tsx:171` (Today tab) | the **statewide** `quoteText`, folded | the only place a full quote renders plainly; wired at `reports.tsx:1062` |
| `RiverReaches.tsx:132` (river screen) | `summaryText \|\| quoteText` per reach | prefers the short one, no expander — a reach's full quote appears only when it has no summary |
| `EddyTake.tsx:298` (river + gauge screens) | `outlook.fullRead \|\| sections?.eddyRead` | this *is* the full quote, blurred for non-subscribers |
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
`src/app/api/admin/login`; `requireUser` in `src/lib/supabase/request.ts` is
Bearer-token auth, and the entitlement it reads is written by the RevenueCat
webhook against a subscription bought in the iOS app. No web page checks
entitlement, because no web visitor has one.

So "the full quote is paid" can only mean **an in-app presentation tier**. It
cannot mean the string becomes unavailable, and the plan must not pretend
otherwise:

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

After this plan, eddy.guide prints the full quote free on river pages while the
iOS app shows the summary free and the full quote behind the gate. That is a
deliberate asymmetry with a reason — one platform has a payment path and the
other has none — and it should be recorded so a later parity pass does not
"correct" it.

`src/lib/eddy-read-parity.test.ts` is untouched by this. It asserts that
`EddyTake` prefers `fullRead` over `sections.eddyRead` and that
`RiverGaugeDetail` prefers `quoteText` over `eddyRead` — both remain true. The
new free card is a different slot on a different tier, and W7 adds the assertion
that keeps it from drifting into the paid one.

## Workstreams

### W1 — One in-memory source for the batched updates

Prerequisite for everything below. Today the batched call has exactly one call
site and one consumer.

- Add `eddy-ios/src/hooks/useEddyUpdates.ts`, mirroring the web hook's name
  (`missouri-float-planner/src/hooks/useEddyUpdates.ts`) so the two are findable
  together. Module-level promise cache with a TTL, in memory only — the same
  shape `reports.tsx` already uses for `gaugesPromise`, which exists so a second
  consumer can await the first one's request instead of firing its own.
- Repoint `reports.tsx` at the hook. Its behaviour does not change.
- **Never persist it.** `riverCache.ts` excludes Eddy's take, and
  `reports.tsx:294-301` gives the reason the prose is never stored across
  launches: `gateGlobalProse` and `overlayLiveConditions` are *live* checks, and
  a stored paragraph about yesterday's water is precisely what they exist to
  suppress. A disk cache would defeat the server-side gate silently.
- Put the selection logic — which entry, summary or fallback, how the written
  age reads — in a pure module under `eddy-ios/src/lib/`, not in the hook. The
  web suite covers iOS pure logic and is where its tests will run.

### W2 — The free Eddy Says card on the river screen

The gap that matters most: `app/river/[slug].tsx` goes reading card →
`RiverReaches` → `EddyTake`, and Eddy never speaks about *this river* unless you
subscribe.

- Place the card between `RiverReaches` and `EddyTake` (around
  `app/river/[slug].tsx:1233`), which is where the web puts `EddyQuote` relative
  to the same content.
- Content: `summaryText`, plus the written-age footnote derived from
  `generatedAt`. That stamp is non-negotiable for the same reason
  `TodaySummary`'s header gives — every other number on the screen is minutes
  old and this sentence is hours old. The condition chip is already above it, so
  the card does not repeat one.
- **The echo, which is real.** The prompt instructs: *"State the condition
  clearly in the first sentence of both the summary and the full text."* For a
  subscriber, the free summary and the opening of the paid full read will say
  the same thing about 200pt apart.
  - *Recommended:* always render the card, and give the two a **deck-and-body**
    relationship — the summary set larger as the lede, the read below it as the
    detail. This is the newspaper arrangement, it reads as deliberate rather
    than duplicated, and it couples the card to no entitlement state.
  - *Rejected:* hiding the card when `entitled === true`. It reintroduces the
    exact flash `EddyTake`'s `'pending'` state was added to prevent — the card
    would paint on every cold open and vanish when `/api/me/profile` lands.

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

### W4 — The map river sheet gets Eddy's voice

`RiverSheet`'s header states its rule: *"No request is made here… Tapping a
river is the cheapest interaction on this screen and it should stay that way."*

W1's in-memory cache preserves that exactly. If the Today tab has already
fetched, the entry is in memory and the sheet renders it; if not, the sheet
renders without it and never blocks or spins on it. Summary line in the river
glance.

### W5 — Share carries the prose

`ShareButton` sends a title and a path. Web's `EddyQuote.tsx:98` puts
`summaryText || quoteText` into the native share sheet.

iOS should share **`summaryText` only** — never the full quote, which would hand
out the paid artifact through the one control designed to send it to other
people. This falls out cleanly: the summary is the block the prompt describes as
"for share cards and compact views", under 120 characters.

### W6 — The null-summary fallback

`summary_text` is nullable. `parse-response.ts`'s last-resort path stores the
quote alone when the model ignores the block format, and logs
`"Could not extract summary from model output"`. A free tier built on
`summaryText` alone shows nothing on those rivers.

The web falls back to the full quote (`summaryText || quoteText`). Under this
plan iOS must not.

- *Recommended:* add `eddyRead` to `/api/eddy-updates`. It already exists on
  `/api/eddy-update/[riverSlug]`, and it is precisely the block designed as the
  short read. Three edits: the route's response builder, and both hand-mirrored
  copies of `EddyUpdateEntry` —
  `packages/eddy-types/index.ts:2704` and
  `missouri-float-planner/src/types/api.ts:1339`.
- **The guard comes free, but say why.** The batched route already skips any
  entry the overlay cleared (`if (!quoteText && !summaryText) continue`), so
  `eddyRead` can only ever be served on a row whose prose survived the same
  live-condition check, from the same snapshot. It needs no separate gate — but
  that reasoning belongs in a comment, because it is not obvious and the
  outlook route deliberately exempts `eddy_read` from the overlay for a
  different reason.
- Fallback order on iOS: `summaryText ?? eddyRead ?? nothing`. Never
  `quoteText`.

### W7 — Guardrails

The tier is a wiring decision in components that cannot share code, which is the
same situation `eddy-read-parity.test.ts` and `outlook-guidance-caveat.test.ts`
already solve with source assertions.

- **The free card must never render `quoteText`.** A source assertion over the
  new component, in the web suite next to the existing parity tests. This is the
  one regression that would silently give away the paid artifact.
- **`EddyUpdateEntry` mirror test.** The two copies are maintained by hand and
  have no parity test today, unlike `dam-catalog-parity` and
  `service-tier-parity`. W6 edits both; add the test with them.
- **Record the divergence** — this document, plus a line in the free card's
  header saying that the web prints the full quote and iOS does not, and why.

## Sequencing

1. **W1** — the hook. Nothing else can start.
2. **W6** — the wire change, before any surface depends on the fallback.
3. **W2** — the river screen. The gap that motivated this.
4. **W3, W4, W5** — independent of each other, any order.
5. **W7** — alongside W2 and W6, not after. The assertion is cheapest to write
   while the component it guards is being written.

## Validation

- `make check-web` — web typecheck, lint and tests, **including the iOS pure
  logic** from W1 and the source assertions from W7.
- `make check-mobile` — iOS typecheck and lint.
- `make bundle-mobile` — the production bundle plus the `.easignore` allowlist
  check, which is what catches Metro breakage invisible in dev.

No migration and no schema change, so `make check-db` is not in scope. Every
column this plan reads already exists and is already populated.

## What this plan does not do

- **Does not remove `quoteText` from the public endpoints.** See
  [the constraint](#the-constraint-that-shapes-everything).
- **Does not cache prose to disk.** The server's gate is a live check.
- **Does not change the web.** No web component, page or route behaviour changes;
  W6 adds one field to one response.
- **Does not change the paywall gate.** `EddyTake` keeps `fullRead`, keeps the
  blur, keeps one lock for three sections.

## Open decisions

1. **The echo on the river screen** (W2) — deck-and-body is recommended over
   hiding the card from subscribers. Worth a look at a real river's summary and
   full quote side by side before committing.
2. **`eddyRead` on the batched endpoint** (W6) — recommended, but the plan works
   without it if rendering nothing on a null summary is acceptable. Check how
   many rivers currently have a null `summary_text` before deciding; if the
   answer is zero, this is speculative work.
3. **Whether the web should follow to summary-first** — recommended no. With no
   consumer session there is nothing to unlock the full quote with, so a web
   summary tier would hide the text from everyone rather than tier it.
