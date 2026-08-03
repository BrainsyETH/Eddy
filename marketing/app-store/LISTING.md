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

```
Eddy tells you what the water is doing on 24 Ozarks float rivers, and whether
today is the day to drive to it.

Live USGS gauge readings on their own are a number without a verdict. Eddy
rates every river against thresholds set by hand for that specific stretch, so
you get an answer — floatable, too low, running high, or stay off — instead of
a chart you have to interpret at a boat ramp with one bar of signal.

WHAT CAN I FLOAT TODAY
See every river's condition at a glance, sorted so the floatable ones come
first. Follow the rivers you care about and they open first every time.

THE WHOLE RIVER ON ONE MAP
Access points, low-water dams and other hazards, gauges, and the river line
itself. Zoom out to see which corner of the Ozarks has water in it.

PUT-IN TO TAKE-OUT
Pick two access points and get the distance, the estimated float time for a
canoe, kayak or raft, and every hazard on the stretch between them. Eddy
refuses to estimate a float time in dangerous water rather than printing a
number you might act on.

ACCESS POINTS WORTH DRIVING TO
Researched put-ins and take-outs with parking, fees, ownership, and directions
that open in the maps app you already use.

ALERTS THAT WATCH THE WATER
Get a push the moment a river becomes floatable, or when it climbs into water
you should stay off. Set them per river or per gauge, with quiet hours.

IT WORKS WHERE THE SIGNAL DOESN'T
The last conditions you saw stay on your phone, labelled with their age, along
with every river's line, put-ins and hazards. A stored reading is never passed
off as a live one.

EDDY PREMIUM
A subscription unlocks Eddy's written daily report on every river: what the
water is doing, what the weather is about to do to it, and Eddy's bottom line.
Rewritten every morning.

River conditions, gauge readings, the trend, hazard information, access points,
float plans and alerts are free, and stay free.

RIVERS COVERED
Missouri: Current, Jacks Fork, Eleven Point, Meramec, Big Piney, Gasconade,
Niangua, North Fork, Black, St. Francis, Big River, Bourbeuse, Huzzah,
Courtois, Bryant Creek, James, Spring.
Arkansas: Buffalo National River, Kings, Mulberry, Caddo, Spring, Crooked
Creek, War Eagle Creek.

Conditions are estimated. Always check with local authorities before getting on
the water.
```

The river list is the last thing anyone reads and the first thing that goes
stale. It is transcribed from `GET https://eddy.guide/api/rivers` — 24 rivers
across MO and AR as of this writing — and should be re-checked against that
endpoint before each submission rather than trusted. A draft of this file
listed an "Elk River" the catalog has never had, and called the North Fork by a
name it does not use.

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
