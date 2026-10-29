# Polish review — web and iOS, 2026-10-29

A point-in-time review against five criteria: Eddy's brand, no "AI sheen",
layout and UX, sparing and plain explainer text, and gaps at the fringes. Web
findings come from screenshots of production (eddy.guide) at 390px and 1440px.
iOS findings come from reading the code, since there is no simulator in this
environment; each High item was checked against current `main`.

The branch that adds this file also fixes the clear bugs, listed under
[Fixed in this branch](#fixed-in-this-branch). Everything else is a
recommendation. Most of it is copy or layout and needs a product call before
anyone builds it.

## Cross-cutting themes

These show up on both platforms. Settling them first makes most of the
per-screen items below mechanical.

### 1. One flow, eight names

The planner is called **Plan a Float on the Current River**, **Plan this
float**, **Plan a Trip**, **Open the planner**, **Build a Route**, **Plan a
float**, **Float this route** and **Floats**. Search is **Find a Route**,
**Find routes** and **Find a float on this river**. Saving is **Save**, **Save
this float to Favorites** and **Keep a route you like**, yet the Favorites tab
never lists floats.

Recommendation: use three verbs everywhere, in sentence case.

- **Plan a float**: choose a put-in and take-out.
- **Find a float**: Eddy suggests one.
- **Start a float**: record it.

Use **Save** and **Saved floats** for keeping one, and drop "Favorites" from
float labels.

### 2. AI sheen

| Pattern | Where |
| --- | --- |
| Sparkle icons on model-written text | Web `components/gauge/EddyOutlookFooter.tsx` (`Sparkles` on "Eddy's read", `EddyIcon name="ai"` on "Bottom line"); iOS `assets/eddy/eddy-ai-assistant.png` via `EddyTake.tsx:522` and the gauge screen's Premium tile (`gauge/[siteId].tsx:841`) |
| Neon glowing lines on dark | Home "Live River Map" tile |
| Uniform icon-chip + title + subtitle tiles | Home "Plan Your Float"; About accordions; iOS `float-home.tsx:146-180`; paywall benefit tiles (`PaywallSheet.tsx:402-415`) |
| Uppercase coral eyebrows on almost every card | Web "FEATURED RIVER", blog fact boxes; iOS "OZARKS PULSE", "EDDY'S PICK", "EDDY'S READ" |
| Monospace for prose | Blog fact boxes ("The day's flow", "3 float routes") |
| Emoji as illustration | 404 page (🌊) where the otter belongs |
| Marketing cadence | Paywall "More than a number" plus em-dash lists (`eddy-ios/src/lib/premiumCopy.ts:63-69`); About "find the perfect time to float"; featured float "A short upper-river outing"; blog "Public accesses provide endpoints, not a shuttle reservation." |

Recommendation: retire the sparkle mark. The otter already signs Eddy's
writing, and the "Eddy's take" heading says who wrote it. Keep one coral
eyebrow per screen, on "Eddy's pick" (or its web equivalent). Turn the
icon tiles into plain rows or links. Keep mono for numbers.

### 3. Technical text reaching floaters

Examples include the USGS site number under "Live report", "Seasonal comparison
based on 105 years of discharge records.", "Below NWS action stage.", "61st
percentile", "Value scale: Loaded window", and "ft = gauge height · cfs = flow
rate". On iOS: "±12 m", "Weak GPS", "Live Activity", "Ready offline · 84 MB",
"Sync now", "Unsynced floats", "unavailable in this build", "No gauge grades
this stretch", "Reference station — no float rating", and
"`Request failed (503)`".

Recommendation: keep source IDs and methodology behind the existing ⓘ sheets.
On the surface, show the reading, the verdict and the age.

### 4. Too many disclaimers

The web footer stacks four: a USGS sentence, "Safety First" (four sentences),
"Water data from USGS", and "For informational purposes only". iOS puts a red
`SafetyDisclaimer` (`SafetyDisclaimer.tsx:159`, `colors.error`) at the end of
every plan and river screen, even when the water is Good. It also has four
different latency notes ("roughly 20–75 minutes", "up to about an hour", …).

Recommendation: one footer line ("Eddy is a planning guide. Check locally
before you launch.") plus the USGS credit. On iOS, set the disclaimer in muted
text and use a single shared latency sentence, shown once per screen.

### 5. The same fact, repeated

- **Web home.** The hero's Eddy's Read card and the first conditions card
  usually show the same river, the same cfs and the same quote, one above the
  other.
- **Web river page.** The reading appears three times: the hero badge, "Right
  now", and the green condition card. There are two weather modules with
  different icon sets (OpenWeather PNGs against lucide line icons). The plan
  CTA appears three times under three labels.
- **iOS Today.** The summary sentence "9 of 24 rivers are floatable" is
  followed by count tiles saying the same thing.

### 6. Two card languages side by side

On web, the river card is a quiet panel (1px neutral border). The dam card
next to it is framed: 2px teal border, tan header, offset shadow. Link styles
vary too: coral "Read guide →", teal "Full River Report →", teal "Full report
›". Pick one card variant per row and one link style.

---

## Web

Paths are relative to `missouri-float-planner/src/`.

### High

1. **Conditions page is a 32,000px scroll on a phone** (`/rivers`). Every river
   and dam renders as a full chart card. "Featured" also leads with two dams
   before any river. Fix: compact rows (name, verdict, cfs, trend) that expand
   or link to the report, with rivers first.
2. **River page CTAs compete.** The hero has "Plan a Float on the Current
   River", "River Guide" and "Share". Further down come "Plan a Trip" in the
   Eddy's take footer, filled dark teal (`EddyOutlookFooter.tsx`, which breaks
   ADR 0007's coral-on-web), and a "Ready to float? Build your trip." card with
   "Open the planner". The sticky bar adds "Plan this float". Fix: keep the hero
   CTA and the sticky one, both "Plan a float", and remove the other two.
3. **The flow chart carries a toolbar's worth of controls inline.** On desktop
   that is seven ranges, Custom, Zoom in, Export CSV, a "Value scale" select,
   two checkboxes, two share buttons, two explainer lines and a data table. ADR
   0010 puts gridlines and export in an expanded mode. Fix: inline, show the
   chart with ranges and ft/cfs only; everything else goes behind "Expand".
4. **Weather card names an obscure town and disagrees with the forecast below
   it.** `components/ui/GaugeWeather.tsx` titles the card with OpenWeather's
   nearest city ("Chicopee Weather" on the Current River). Its icons are
   OpenWeather PNGs, while "Will it hold?" two cards down uses lucide icons for
   the same days. Fix: drop the compact weather card from the river page
   ("Will it hold?" already covers the next 72 hours), or title it by the gauge
   ("Weather at Van Buren") and use the lucide set.

### Medium

5. **Home.**
   - Dedupe the hero card and the first conditions card (pick a different river
     for one of them).
   - Replace the "Plan Your Float" icon tiles and the glowing map tile with two
     plain links and a real map thumbnail.
   - Remove the five "Read guide →" links. The whole card is the link.
   - "FEATURED RIVER" sits over a busy photo and is hard to read.
6. **Conditions hero ignores the filter.** It says "4 rivers looking great, 20
   running low. Check the details before you head out!" even on the Lakes &
   Dams tab. Make it follow the tab and drop the exclamation.
7. **Dam copy.**
   - "Next: No more generation in the posted schedule." → "No more releases
     today."
   - "Next: Generation scheduled for every remaining hour posted." → "Releasing
     through midnight."
   - The empty "Tomorrow" box is about 110px of tan; one line is enough.
   - "Water temp Unavailable" is set in bold; hide the field instead.
   - The Bagnell page leads with "Current generation unavailable" while showing
     912 cfs; lead with the release.
   - The phone number appears twice.
   - "Water level below dam 551.41 ft elevation" is jargon.
8. **Status labels.**
   - "Good - Floatable" uses a hyphen (`shared/condition-system.ts:106`, which
     the app also reads). Use "Good" in the badge, or an en dash.
   - "Unlock the full read in the iOS app" → "Get Eddy's full read in the app".
9. **Planner (`/plan`).**
   - It opens on a seven-state view where tan count badges for non-Eddy gauges
     (Iowa, Kansas, Indiana) outweigh the Ozarks rivers. Open on the Ozarks, or
     hide reference gauges until zoomed in.
   - The header shows an "Unknown" condition chip and a camera icon before any
     river is chosen.
10. **Float times are long-form.** "About 2 hours 30 minutes – 3 hours 45
    minutes" and "~2 hours – ~3 hours 15 minutes" should read "2½–3¾ hr". Echo
    Bluff in "Nearby" has no time at all.
11. **Stops are counted two ways.** Web says "Times include ordinary stops."
    iOS `float-start.tsx:254` says "Moving time · stops not included" for the
    same stretch. Pick one basis.
12. **Access page.**
    - "What the river looks like" shows other accesses' photos (Jerktail
      Landing on Akers Ferry) with no sign that they are from elsewhere.
    - The breadcrumb wraps around Share at 390px.
    - "ROAD PAVED" is uppercase next to title-case values.
13. **Global 44px floor** (`app/globals.css`, the `@media (max-width: 1023px)`
    block). It forces every `button` and `a` to 44×44 on mobile, which is what
    turned the 8px photo dots into 44px discs. Scope it to controls that opt
    in, or audit the other small buttons it inflates.

### Low

14. **404** (`app/not-found.tsx`).
    - Replace the emoji with the otter.
    - "404 - Page Not Found" → "This page floated off."
    - The three actions mix one filled button with two underlined links.
15. **Blog article.**
    - The meta row leaves bullets dangling at line starts.
    - "← View Report" is an odd back-link label for a guide.
    - The title ends in a period.
    - Prose is set in mono.
16. **About.** Generic copy ("Learn how we help you find the perfect time to
    float", "We currently support multiple rivers"). Oversized accordion
    headings with icon chips.
17. **`/chat`** renders "Chat Coming Soon" to anyone who finds it. Redirect it or
    mark it noindex until chat returns.
18. **Photo reuse.** The same Current River mill-dam photo is the home guide
    hero, the river hero and the first featured float.
19. **Footer.** The Instagram and Facebook rows have uneven spacing.

---

## iOS

Paths are relative to `eddy-ios/`. `D/` is
`app/(tabs)/(today,map,floats,favorites,alerts)/`.

### High

1. **A failed load says nothing is floatable.** `useTodayCatalog.ts:18` shows the
   raw `Request failed (503)` / `No connection`. The hub then renders "No fresh
   floatable reading yet" and "All 0 · 0 Floatable". Fix: show one error card,
   "Couldn't load rivers. Pull down to try again.", in place of the hub.
2. **No way to plan from a river or access screen.**
   - `D/river/[slug].tsx`: the only filled button is "Alert me about this river".
   - The access screen offers Directions, View on map and Official site.
   - `plan-route.tsx` already accepts `focusRiver` and `planPutIn`.
   - Fix: add "Plan a float" under the river reading card and "Put in here" on
     the access screen. Make the alert bell an outlined button.
3. **"Float this route" stays the primary action on a dangerous plan.**
   `floatEntry.ts` never checks the condition, so the button sits under "Water
   conditions are dangerous - do not float". Fix: show an outlined "Review
   conditions" when the code is `dangerous`.
4. **The finished plan has two filled buttons and two Saves** (`PlanSheet.tsx:378-449`).
   Keep "Float this route" as the only filled button, and keep one Save.
5. **Nobody is told that closing Eddy pauses tracking.** The line exists in
   `floatTrackerStatus.ts:87-88` but is never shown. Show "Lock your phone
   anytime. Don't swipe Eddy closed." once on Ready to float.
6. **"Start tracking" is greyed out with no reason** (`float-start.tsx:220`). The
   location explanation sits below three cards. Fix: label the button "Allow
   location to start" and have it request permission.
7. **The recap is thin and its main button leaves the trip**
   (`src/float/FloatRecap.tsx`).
   - There is no map of the floated stretch and no Share.
   - The filled button is "Your float history".
   - "Ended before arrival was confirmed" reads as a failure.
   - A "GPS gaps" segment shows even at 0 min.
8. **River Mode puts four status lines before the miles left**
   (`float-mode.tsx`). "End float" is outlined in red, though taking out early is
   normal. Fix: show miles left first, fold the status into a dot, and keep red
   for Discard only.
9. **A river with no gauge shows an empty reading card** (`D/river/[slug].tsx:1381`):
   "No reading available" and "Observation time unavailable". Replace it with
   one line.
10. **Large text clips** `PushPrimer` and `AlertSignInSheet`, which have no
    ScrollView.

### Medium

11. **Today order.** Eddy's Reads (blurred for free users) sits above Best Near
    You (`TodayHub.tsx:597-676`). Put the answer first. Drop the count tiles
    that repeat the summary, and show a "No fresh reading" tile during gauge
    outages (`TodayRiverConditions.tsx:48`).
12. **Paywall.**
    - Signed-out users see no prices (`PaywallSheet.tsx:476-495`).
    - The caveat is set in danger red (`:419`).
    - The lock prompt says "your favorite river" on any river
      (`premiumCopy.ts:144`).
13. **Hazards come after logistics and photos.** On the plan
    (`PlanResult.tsx:268-311`) and on the river screen, move hazards up to sit
    under the condition.
14. **Dead ends.**
    - The Favorites empty state has no button (`favorites.tsx:299`).
    - The float history empty state has no button (`floats.tsx:187`).
    - First launch offline shows the map's "needs a connection" message with no
      retry (`(map)/index.tsx:2866`).
    - Camping's "No campgrounds match these filters." has no Clear button.
    - A dead float link still offers Try again (`float/[shortCode].tsx:208`).
15. **History says you reached a take-out you didn't** (`floats.tsx:236`). It also
    shows "0.0 mi tracked".
16. **Two "Alerts" screens.** The Today bell opens `current-alerts`, which
    duplicates the Alerts tab's segments under different names.
17. **Multi-gauge Favorites show color-only verdicts** (`FavoriteRiverGauges.tsx:36`).
    Add the word: "Good · 944 cfs".
18. **Unstyled text falls back to the system font.**
    - `camping.tsx`: about a dozen labels.
    - `CampingDetailSheet.tsx`.
    - `D/river/[slug].tsx:1494, 1699`.
    - `(map)/index.tsx:2971`.
    - Today's large title (`TabStack.tsx` sets no `headerLargeTitleStyle`, so it
      is not Fredoka like Favorites and Alerts).
19. **Picker repeats itself** (`PlanAccessPicker.tsx:114-148`). A toggle, a
    heading and an explainer all say "nearest", and each row adds "straight
    line". The most downstream access can be chosen as a put-in, which leads
    straight to "There is nothing downstream".
20. **Long floats aren't flagged.** A 14-hour estimate only gets "Allow extra
    time". Above about 8 hours, say it is likely more than a day.

### Low

21. **Radii bypass `radii` tokens.** 18, 14, 10, 13, 22 and 24 are hard-coded
    across the Today, Floats, Plan and camping files. The same plan button is a
    pill on the map peek and radius 12 in the sheet.
22. **Mixed title case.** "River Conditions", "Best Near You" and "Saved Floats &
    History" sit beside "River guides" and "Float history".
23. **British spellings.** "neighbouring" (`storage.tsx:178`,
    `AccessTabs.tsx:402`) and "uncoloured" (`(map)/index.tsx:2980`).
24. **The weather screen borrows Apple Weather's look.** "H:/L:", the all-caps
    "NEXT 24 HOURS · 3-HOUR FORECAST", and a 72pt hard-coded temperature.
25. **Favorites offline stamp.** It prints `toLocaleString()` ("10/29/2026,
    6:42:13 AM"); "Updated 6:42 AM" is enough.

### Copy to cut or rewrite

A sample. The pattern is to delete a line if the screen already implies it,
and otherwise say it plainly.

| Where | Now | Suggested |
| --- | --- | --- |
| `OnboardingSignIn.tsx:18`, `profile.tsx:601` | "sync your favorites" | "keep your favorites on any iPhone you sign in on" |
| `float-backup.tsx:85,118` | "Sync now" | "Back up now" |
| `configure.tsx:596`, `quiet-hours.tsx:130` | "…unavailable in this build." | "Sign-in isn't available right now." |
| `float-mode.tsx:195` | "GPS isn't accurate enough to place you on the river right now (±{n} m)…" | "Finding you on the river…" |
| `float-mode.tsx:351` | "Miles to the river's closest point…" | delete |
| `TripDownloadCard.tsx:347,407` | "Ready offline · {MB}", "Optional: River Mode tracks without it." | "Ready offline", delete |
| `SavedFloatDetails.tsx:198` | "Water conditions, closures and float times are not verified here." | delete |
| `PlanResult.tsx:218` | "Dam releases can change mid-float, so one estimate would be wrong the moment the units start or stop…" | "Dam releases change the pace. Check today's schedule." plus a link |
| `PlanResult.tsx:519` | "Reading from USGS {id}" | "Check the source reading" |
| `layers.ts:605-607` | "Rated stations wear a condition colour, graded against each river's own ladder…" | "Color shows Eddy's rating. Gray: no rating." |
| `GaugeSheet.tsx:161,331` | "Eddy has not rated this station against a river yet.", "Reference station — no float rating" | "Not rated for floating." |
| `EddyTake.tsx:463` | "Forecast is river stage in feet — this river is rated in cfs." | "Forecast in feet." |
| `ReminderPermission.tsx:14` | "Notifications allowed. GPS gaps or phone settings can delay or silence reminders." | delete |
| `TodayScreen.tsx:1580` | "Fresh summaries return when the latest water and written conditions agree." | delete |
| `storage.tsx:178` | "neighbouring" | "neighboring" |

---

## Fixed in this branch

| Issue | Fix |
| --- | --- |
| Web: on phones, the river page's sticky section tabs shrank until "Live status" and "Access points" overlapped | `HubSectionNav.tsx`: tabs no longer shrink; the row scrolls |
| Web: photo gallery dots rendered as 44px white discs over the photo (the mobile 44px floor) | `RiverVisualGallery.tsx`: the button is the hit area, with an 8px dot inside |
| Web and app: daily forecast icons could show a night moon for a clear day (Thursday's 80° drew as a dark circle) | `lib/weather/openweather.ts`: day summaries always use the daytime icon |
| iOS: free users could read the first line of a placeholder sentence presented as Eddy's read when the server sent none | `EddyTake.tsx`: no legible line without real text |
| iOS: Eddy's Pick dropped agency notices; `BestRiverNotices` was built and never rendered | `TodayHub.tsx`: the notices row sits above "Plan this river" |
| iOS: "Time to update Eddy" was a dead end with no button | `UpgradeGate.tsx`: "Update Eddy" opens the App Store page; the redundant footnote is cut |
| iOS: "View river" on the conditions-unavailable card had a black default border | `TodayHub.tsx`: uses the theme border |
