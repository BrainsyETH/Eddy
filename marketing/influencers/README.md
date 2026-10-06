# Creator outreach — a free year for honest feedback

The ask is small on purpose: **a free year of Eddy Premium in exchange for
feedback.** No required post, no script, no deliverables. People who float
the Ozarks on camera are the users most likely to catch a wrong rating, a
missing put-in, or a confusing screen, and they're also the ones whose
followers decide where to float this weekend. Feedback is the trade. If any of
them post about Eddy, that's a bonus, not the deal.

Budget: $0. The only cost is your time and the Premium revenue we give up on
the codes.

| File | What it is |
|---|---|
| `README.md` | This plan: the offer, how codes work, the sequence, and what to track |
| `messages.md` | Paste-ready DMs and emails for every step |
| `prospects.csv` | Outreach tracker, prefilled with the 38 channels ClipEngine already scans |

---

## Be precise about what the year buys

Premium unlocks **one thing: Eddy's written daily report on every river**.
Conditions, gauges, hazards, access points, float plans and alerts are free and
stay free (`premium-copy.test.ts` enforces this in the app, and the App Store
listing makes the same promise). If outreach calls Premium "the full app" or
"all the features", the first thing a creator learns on install is that we
oversold it. Every template in `messages.md` says it accurately.

The honest pitch is still a good one: *"The app is free. Here's the paid part
free for a year, and I'd love to know what you think of all of it."*

---

## How the free year is delivered: Apple offer codes

The app plumbing is already built (`eddy-ios/src/lib/purchases.ts`,
`OFFER_CODE_REDEEM_URL`): the account screen has a **Redeem code** button
that opens Apple's code-entry screen and syncs the entitlement when the user
comes back. Nothing needs to ship.

### One-time setup in App Store Connect

1. **Apps → Eddy → Subscriptions →** the annual product **→ Offer Codes → +**.
2. Reference name: `Creator free year — 2026`.
3. Eligibility: **New, Expired, and Existing** subscribers, so a creator who
   already pays still benefits (Apple applies it after their current period).
4. Offer: **Free**, duration **1 year**.
5. Codes: generate **one-time-use codes**. Each code works once, so a code
   can't leak beyond the person it was sent to, and the code itself tells you
   who redeemed. Start with 50 codes. You can generate more later.
   *(Alternative for later: a **custom code** like `FLOATSHOWME` with a
   redemption cap. Useful if a creator wants to give their audience a code;
   not needed for the feedback group.)*
6. Download the CSV of codes. Paste one into the `code` column of
   `prospects.csv` **only when you send it**, so the sheet shows which
   codes are out.

### Two facts every creator must be told (both are in the templates)

- **Sign in first, then redeem.** The Redeem button only appears after Sign
  in with Apple. That's deliberate: Premium attaches to the Eddy account, and a
  code redeemed before sign-in has no account to attach to
  (`REVENUECAT_SETUP.md`, "Four things that trip people up", #1).
- **It renews after the year unless they cancel.** An offer code is a free
  period on a real subscription, so it becomes the normal annual price at month
  12. Say this up front. A surprise charge a year later turns a fan into a
  complaint.

### Verify before the first send

Redeem one code yourself on a personal Apple ID, using the TestFlight or
production build, and confirm that Premium turns on in the app and an
`eddy_premium` row lands in `entitlements`. If that fails, find out on your
own phone, not in front of a creator.

---

## Who to contact

`prospects.csv` starts with the 38 channels in `clipengine-local/channels.json`.
They're there because they film river content, **not** because anyone checked
that they float the Ozarks. Sort them before sending:

- **Tier A, local Ozarks floaters.** Missouri/Arkansas rivers on camera
  regularly. These people will actually use Eddy and are the whole point.
  (Names like ShowMeCreeks, OzarkMediaCo, AROwnBackyard, experiencetheozarks
  and floatingwithkcmike suggest Tier A, but confirm that from their videos.)
- **Tier B, regional paddlers and Midwest outdoors.** Occasional Ozarks trips.
- **Tier C, national or global** (KayakSessionTV, PaddleTV…). Low fit for an
  Ozarks app. Skip for now.
- **`flood_only` channels** are in ClipEngine for high-water footage. Skip
  them unless their back catalog shows normal floats.

**Aim for 15 good Tier A creators, not 38 sends.** Ten real conversations
beat a blast.

Fill the gaps (all free, about an hour):

- YouTube / TikTok / Instagram searches: `Current River float`, `Jacks Fork`,
  `Buffalo National River float`, `Eleven Point`, `Niangua`, `Meramec float trip`,
  `#ozarkfloat`, `#floattrip`. Sort by recent and favor people with steady
  posting over one viral clip.
- **Ozarks float Facebook groups:** the admins and the regulars who post water
  reports are micro-influencers with exactly the right audience, and they care
  about accurate conditions more than anyone.
- **Fishing guides on tailwaters** (Taneycomo, White, Norfork). Eddy's dam and
  generation pages serve them directly.
- **Outfitters' own social accounts.** Pair this with the existing widget
  emails in `../README.md`.

### Check this first: ClipEngine may already have posted their footage

ClipEngine clips these creators' videos, brands them, and posts them to
Eddy's FB/IG with credit (`docs/clipengine-ops.md`). Before writing to anyone,
check `clip_library` / `social_posts` for their channel. Then:

- If we've featured them, **say so openly and thank them** (template 1b).
  It's a warmer opener than a cold message, and they'd find out anyway.
- If they object to the reposts, stop and take their channel out of
  `channels.json` that day. That matters more than this campaign.

---

## The sequence

| Day | Step | Template |
|---|---|---|
| 0 | Short DM on the platform where they're most active (IG/TikTok DM, YouTube "About" email) | 1a / 1b |
| 4–5 | One follow-up if no reply. Then stop. | 2 |
| on yes | Send the code + the two facts + what feedback helps | 3 |
| +10–14 days | Feedback check-in with the five questions | 4 |
| after feedback | Thank-you that names what you changed or will change | 5 |
| next spring | Season-opener nudge ("rivers are up, anything look off?") | 6 |

Rules that keep it from feeling like marketing:

- **Send from you, by name,** as the person who built Eddy. Not a brand
  account, and no templated-feeling blast.
- **One specific line per person**: a river or video of theirs you actually
  watched. That line is most of the reply rate.
- **No posting obligation, ever.** If they post, ask them to tag
  `#gifted`/"free subscription from Eddy". That's an FTC rule for them, and it
  protects us too.
- **Close the loop.** The thank-you that says "you said X, it's fixed in 1.3"
  is what turns a tester into someone who mentions Eddy unprompted.

### Timing (it's October)

Float season is winding down, which suits this campaign:

- **Now through November:** outreach and fall floats. The free year covers
  the whole 2027 season, which is a natural hook.
- **Winter:** turn the feedback into fixes. Creators plan spring content in
  Feb/March.
- **March/April:** season-opener nudge (template 6). This is when posts, if
  any happen, are worth the most.

---

## Where feedback lands

- **In-app:** *"Didn't match the river? Tell Eddy"* at the bottom of every
  river screen, or Settings → Help → *Send feedback*. Both open
  `FeedbackSheet`, which writes to the `feedback` table and the admin queue.
  From a river or gauge screen, that context is attached automatically. **Ask creators to use this for anything they hit on the water**:
  it carries more context than a DM ever will.
- **Bigger-picture answers** (template 4) come back as DM or email replies. Copy
  the key line of each into the `feedback_summary` column so it's all in one
  place.

---

## What to track (`prospects.csv`)

`status` moves through: `to_research` → `queued` → `contacted` → `followed_up`
→ `accepted` / `declined` / `no_reply` → `code_sent` → `redeemed` →
`feedback_received` → `thanked`.

After the first 15 sends, check:

| Measure | Healthy |
|---|---|
| Reply rate (any reply ÷ contacted) | 30%+ for Tier A with a personal line |
| Accept → redeemed | 70%+. Lower means the sign-in-then-redeem step is confusing |
| Redeemed → feedback received | 50%+ |
| Feedback items that became a fix or a data correction | the number that actually matters |
| Unprompted posts / mentions | bonus. Note them, never chase them |

If reply rate is low, change the opener. If redemption is low, the
instructions are failing; that's a product finding, so fix the flow.
