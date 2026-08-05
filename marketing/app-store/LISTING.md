# Eddy — App Store Connect listing copy

Every text field App Store Connect asks for at submission, written once and
kept here rather than typed into the dashboard from memory at eleven at night.

`SHOT_PLAN.md` is the visual half of the same listing; this is the words. The
screenshots in `exports/iphone-6.9-native/` are the six images these fields sit
beside, and the order of the feature bullets below deliberately matches the
order of those captures — a description that introduces features in a different
order than the images scroll past reads as two people's work.

**Character limits are Apple's and are counted, not estimated.** Where a field
is near its ceiling the count is recorded beside it so a future edit knows how
much room it has.

**Nothing here may claim something the app does not do**, and two claims in
particular have to stay true because the paywall is built on them: conditions,
readings, hazards, access points, float plans and alerts are free, and what a
subscription buys is Eddy's written daily report. `premium-copy.test.ts`
enforces that inside the app; this file is the same promise on the store page,
where no test can reach it.

---

## App name — 30 max

```
Eddy: Ozarks River Levels
```

24 characters. The name field is the strongest keyword field Apple has, so it
carries "Ozarks" and "river levels" rather than being the bare brand. "Eddy"
alone is a common word and would not surface for anything.

## Subtitle — 30 max

```
Float trip planner & gauges
```

26 characters. Names the two jobs in the order people arrive with them:
planning a float, and checking whether it is worth driving to.

## Promotional text — 170 max, editable without a review

```
New: Eddy's daily written report on every river, hazard maps for 24 Ozarks rivers, and alerts that tell you the moment your river becomes floatable.
```

146 characters. This is the one field that can be changed without submitting a
build, so it is where a seasonal message goes — spring high water, a new river,
a drought summer. Do not put anything here that the description depends on.

## Description — 4000 max

**This is the copy that is LIVE on the listing.** It was transcribed back from
App Store Connect after submission 4, because what this file held and what had
actually been submitted were two different descriptions — different opening,
different headings, different treatment of the river list. A listing file that
disagrees with the listing is worse than no file, since it is trusted.

```
Eddy brings live river conditions, access point info, and float-trip planning together in one friendly place. Whether you are planning a multi-day trip in a canoe or a quick tube float, Eddy helps you understand the trip before you get on the water.

CHECK LIVE RIVER CONDITIONS
See current water levels and flow trends powered by USGS gauge data. Eddy translates the numbers into an easy-to-read river report so you can make a more informed plan.

PLAN YOUR FLOAT
Choose a river, put-in, take-out, and vessel. Eddy estimates river distance and time on the water using the route and current conditions.

EXPLORE ACCESS POINTS
Find put-ins, take-outs, campgrounds, outfitters, and nearby services. Review useful access details before leaving home.

HANDLE THE LOGISTICS
See estimated shuttle distance and drive time, open directions, check weather, and share your float plan with friends.

DISCOVER OZARK RIVERS
Explore popular float rivers across the Ozarks, including the Current, Jacks Fork, Eleven Point, Meramec, Niangua, Big Piney, Huzzah, Courtois, and more as Eddy grows.

Subscription options:
• Eddy Monthly — $1.99 per month, one month of access
• Eddy Annual — $19.99 per year, one year of access

Payment is charged to your Apple Account at confirmation of purchase. Subscriptions renew automatically unless auto-renew is turned off at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions in your Apple Account settings after purchase.

Terms of Use (EULA): https://eddy.guide/terms
Privacy Policy: https://eddy.guide/privacy

River conditions can change quickly. Eddy is an informational planning tool, not a substitute for local knowledge, official alerts, proper equipment, or personal judgment. Always check current conditions and follow guidance from land managers and local authorities.
```

App Store Connect's own counter reads **2,059** on this field. The transcription
above is a few characters short of that — line endings and the wrapping the ASC
textarea applies do not survive a copy — so treat 2,059 as the real number and
ASC as the authority. There is comfortable room either way.

### The subscription block is not optional and not decoration

Everything from "Subscription options:" through the Privacy Policy line exists
because **submission 4 was rejected under guideline 3.1.2** for offering
auto-renewable subscriptions without a functional Terms of Use link in the
metadata. Guideline 3.1.2 wants all of these in the description:

| Required | Where it is |
| --- | --- |
| Subscription title | "Eddy Monthly" / "Eddy Annual" |
| Length | "one month of access" / "one year of access" |
| Price | `$1.99` / `$19.99` |
| Renewal terms | the "Payment is charged…" paragraph |
| Terms of Use (EULA) link | `https://eddy.guide/terms` |
| Privacy Policy link | `https://eddy.guide/privacy` |

**Terms of Use has no field of its own in App Store Connect.** Privacy Policy
URL does, which is exactly why the Terms link was missed: filling in every
labelled field was not enough. It has to be in this description text, or in a
custom EULA pasted into App Information → License Agreement. Do not remove it
to save characters.

Prices are stated in USD and are transcribed from the subscriptions in App
Store Connect — the app itself never hardcodes them (`purchases.ts` quotes
`priceString` from StoreKit), so this file and the dashboard are the only two
places the number exists and they have to be checked against each other.

If an introductory offer or free trial is ever configured on either product,
its length has to be added here too. There is none as of submission 5.

### Two things this description does deliberately

**It does not enumerate the rivers.** "including the Current, Jacks Fork …
and more as Eddy grows" cannot go stale; an explicit list of 24 can, and did —
an earlier draft of this file invented an "Elk River" the catalog has never had
and called the North Fork by a name it does not use.

**It does not yet say what Premium unlocks.** The price is stated with no
benefit beside it, which is not a 3.1.2 violation but is a soft spot on a
version that has already been rejected once. The paragraph to add above
"Subscription options:", if it is ever wanted, and which the in-app paywall and
`premium-copy.test.ts` already agree with:

```
EDDY PREMIUM
A subscription unlocks Eddy's written daily report on every river: what the
water is doing, what the weather is about to do to it, and Eddy's bottom line.
Rewritten every morning. River conditions, gauge readings, hazards, access
points, float plans and alerts are free, and stay free.
```

## Keywords — 100 max, comma separated, no spaces

```
float,canoe,kayak,river,gauge,usgs,water level,ozarks,missouri,arkansas,put-in,paddling,trip,flow,cfs
```

99 characters. Rules that produced this list:

- **Never repeat the app name or subtitle.** Apple already indexes both, and a
  repeat spends characters for nothing. That is why "eddy", "planner" and
  "levels" are absent.
- **Singular only.** Apple matches plurals from singulars, not the reverse.
- **No spaces after commas** — a space costs a character and matches nothing.
- **No competitor names and no "app".**

## What's New — 4000 max

First submission:

```
First release.

Eddy rates 24 Ozarks float rivers against thresholds set by hand for each
stretch, maps their access points and hazards, estimates float times put-in to
take-out, and can push you the moment a river becomes floatable.
```

Later releases: say what changed for the person reading it, not what changed in
the codebase. "The Today tab remembers whether you had the daily report open"
rather than "fixed TodaySummary fold state".

---

## Fields that are not copy

Recorded here because they are asked for in the same sitting and are easy to
answer inconsistently.

| Field | Answer |
| --- | --- |
| Primary category | Navigation |
| Secondary category | Sports |
| Support URL | `https://eddy.guide/support` |
| Marketing URL | `https://eddy.guide` |
| Privacy Policy URL | `https://eddy.guide/privacy` |
| Terms of Use (EULA) | `https://eddy.guide/terms` — **no ASC field exists**; it lives in the Description. See that section. |
| Copyright | `2026 Eddy` |
| Sign-in required to review | No — see the reviewer notes |
| Contains third-party content | Yes — USGS, NWS and NPS data, credited in-app and in the Terms |

Primary category is **Navigation** rather than Sports on purpose: the app's
core is a map, live conditions and routing between access points, and Navigation
is the less crowded of the two. Revisit only with a reason, since the category
affects which charts it can rank in.

## The rest of the submission

Not here, because they are already written down and duplicating them is how two
copies disagree:

- **App Privacy answers** — `docs/app-privacy-labels.md`, with the code that
  makes each answer true.
- **Reviewer notes** — the paste-ready block at the bottom of that same file.
- **Screenshots** — `SHOT_PLAN.md` and `exports/iphone-6.9-native/`.
- **The release path itself** — `docs/ios-release-runbook.md`.

## Age rating

Answered in App Store Connect's questionnaire, not here — but two answers are
not obvious and should be given the same way every time:

- **User-generated content: YES.** Eddy publishes community river photos. Say
  so. The follow-up asks whether it is moderated: it is, before publication —
  submissions sit in a private bucket until a person verifies them — and the
  app carries an in-app reporting route on every published photo.
- **Unrestricted web access: NO.** The app opens external links in Safari and
  the maps app; it embeds no browser.
