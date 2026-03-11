# Eddy.guide — Facebook & Instagram Marketing Plan

**Goal:** Drive awareness and traffic to eddy.guide before and during the 2026 Missouri float season
**Budget:** $50–200/month (hybrid organic + paid)
**Operator:** Solo
**Timeline:** Pre-season ramp-up (March–May) → Peak season (June–August) → Shoulder season (Sept–Oct)

---

## Table of Contents

1. [What You Already Have (Auto-Posting Review)](#1-what-you-already-have)
2. [Strategy Overview](#2-strategy-overview)
3. [Content Pillars](#3-content-pillars)
4. [Posting Cadence](#4-posting-cadence)
5. [Phase 1: Pre-Season (March–May)](#5-phase-1-pre-season-march-may)
6. [Phase 2: Peak Season (June–August)](#6-phase-2-peak-season-june-august)
7. [Phase 3: Shoulder Season (Sept–Oct)](#7-phase-3-shoulder-season-sept-oct)
8. [Paid Promotion Strategy](#8-paid-promotion-strategy)
9. [Community & Growth Tactics](#9-community--growth-tactics)
10. [Content Templates](#10-content-templates)
11. [Metrics & KPIs](#11-metrics--kpis)
12. [Weekly Workflow (Solo Operator)](#12-weekly-workflow-solo-operator)
13. [Auto-Posting Config Recommendations](#13-auto-posting-config-recommendations)

---

## 1. What You Already Have

Your automated social media system is **production-grade** and gives you a massive head start. Here's what's working:

### Strengths
- **Automated daily digests** — all 8 rivers, both platforms, with condition-aware formatting
- **Per-river highlight posts** — staggered schedules with per-day-of-week control
- **Condition change alerts** — real-time triggers when rivers shift (optimal, flood, etc.)
- **Platform-specific formatting** — hashtags on Instagram only, Eddy quotes on IG only
- **OG image generation** — dynamic social cards for both 1080x1080 (FB) and 1080x1920 (IG Stories)
- **Admin dashboard** — full control panel with post history, preview, retry, custom content
- **Seasonal content seeds** — pre-loaded promo, tip, and seasonal snippets in the database
- **Deduplication & retry logic** — prevents spam, handles failures gracefully
- **Weekend engagement hooks** — Thu–Sun posts include "Who's hitting the water?" questions

### Recommendations for the Existing System

1. **Switch Instagram from Stories-only to Feed + Stories**
   - Currently: `media_type: 'STORIES'` (expires in 24 hours, no caption shown)
   - Recommendation: Post highlights as feed posts (permanent, searchable, shows caption + hashtags) AND mirror as stories
   - Stories are great for real-time alerts, but feed posts build long-term content
   - In `meta-client.ts`, add a feed posting path that uses `IMAGE` media type with caption

2. **Add UTM parameters to all CTA links**
   - Change: `https://eddy.guide/rivers/{slug}` → `https://eddy.guide/rivers/{slug}?utm_source={platform}&utm_medium=social&utm_campaign=auto_post`
   - This lets you track which platform and post type drives the most traffic in analytics

3. **Expand engagement questions**
   - Current set is good but small (4 questions). Add:
     - "Drop a 🛶 if you floated this week"
     - "Best put-in on {river}? Go."
     - "Float trip snack tier list — what's S-tier?"
     - "What's your go-to river when the Meramec is too crowded?"

4. **Add a "tip of the day" post type**
   - Use the `social_custom_content` table (content_type: 'tip')
   - One tip post per day, rotated from a pool of 30+ float tips
   - Examples: packing lists, shuttle tips, what to do when water's low, first-timer advice

5. **Consider posting river highlights to Instagram feed, not just Stories**
   - Feed posts have a longer shelf life and are discoverable via hashtag search
   - Stories are ephemeral — good for urgency ("flood alert!") but not for building content library

---

## 2. Strategy Overview

### The Core Insight
Eddy solves a **time-sensitive, high-intent problem**: "Can I float this weekend?" Every post should either:
1. **Answer that question** (condition updates, river reports)
2. **Build trust** that Eddy is THE source for that answer (tips, education, personality)
3. **Create FOMO** that makes people want to float (beautiful river photos, "perfect conditions" posts)

### Platform Roles

| Platform | Role | Content Style |
|----------|------|---------------|
| **Facebook** | Community hub, sharing, trip planning | Longer captions, river reports, group engagement, event-style posts |
| **Instagram** | Visual discovery, brand personality | River photos, Eddy otter graphics, Reels (future), Stories for real-time |

### Content Mix (80/20 Rule)
- **80% value-first content**: River conditions, tips, trip planning help, river knowledge
- **20% promotional**: "Plan your float on eddy.guide", feature highlights, app walkthroughs

---

## 3. Content Pillars

Every post should fall into one of these 5 pillars:

### Pillar 1: River Intel (Automated — Already Built)
> "What's floating good right now?"
- Daily digest posts
- Individual river highlights
- Condition change alerts
- **This is your competitive moat — no one else auto-posts live conditions**

### Pillar 2: Float Tips & Education (Manual — 2x/week)
> "Here's something that'll make your next trip better"
- Packing checklists, shuttle logistics, gauge reading 101
- "First time on the Current River? Here's what to know"
- "What does 'Optimal' actually mean?" (explain your condition system)
- Safety tips (life jackets, reading water, what to do in high water)

### Pillar 3: River Beauty / FOMO (Manual — 2x/week)
> "Look at this. Don't you want to be here?"
- River photos with location callouts
- "This is what Optimal looks like on the Current River" (photo + conditions overlay)
- Seasonal beauty: spring wildflowers, summer sun on water, fall colors
- Eddy the Otter in scenic river contexts

### Pillar 4: Community & Engagement (Manual — 1x/week)
> "We're all in this together"
- "Where did you float last weekend?"
- "Tag your float crew"
- "Best river for beginners? Drop your pick"
- Poll: "Canoe vs. Kayak vs. Tube — what's your go-to?"
- Repost/share user photos (with permission)

### Pillar 5: Product Awareness (Manual — 1x/week)
> "Eddy makes this easier"
- App walkthrough screenshots: "Here's how to plan a float in 30 seconds"
- Feature spotlights: shareable plans, condition alerts, shuttle times
- "Eddy the Otter says..." mascot personality posts
- Comparison: "Planning a float trip WITHOUT Eddy vs. WITH Eddy"

---

## 4. Posting Cadence (Solo-Friendly)

### Automated (Already Running)
| Post Type | Frequency | Platform |
|-----------|-----------|----------|
| Daily Digest | 1x/day | FB + IG |
| River Highlights | Up to 8x/day (staggered) | FB + IG |
| Condition Alerts | As triggered | FB + IG |

### Manual (You Create)
| Post Type | Frequency | Time Needed |
|-----------|-----------|-------------|
| Float Tip / Education | 2x/week | 15 min each |
| River Photo / FOMO | 2x/week | 10 min each |
| Community Engagement | 1x/week | 10 min |
| Product Awareness | 1x/week | 15 min |

**Total manual effort: ~2 hours/week**

### Best Posting Times (Missouri/CST)
- **Weekdays:** 7–9 AM (morning scroll), 12–1 PM (lunch break), 5–7 PM (evening planning)
- **Weekends:** 8–10 AM (planning the day), 7–9 PM (post-float engagement)
- **Thursday/Friday:** Highest intent — people planning weekend floats

---

## 5. Phase 1: Pre-Season (March–May)

### Theme: "Float Season is Coming"

This is your ramp-up window. Rivers are volatile (rain, spring runoff), which is actually **great content** — it creates drama and anticipation.

### Weekly Content Calendar

| Day | Post Type | Example |
|-----|-----------|---------|
| **Monday** | Float Tip | "5 things to check before your first float of the season" |
| **Tuesday** | (Auto) River Digest + Highlights | Automated condition posts |
| **Wednesday** | River Photo + FOMO | Spring runoff photo: "The Current River is waking up. Are you ready?" |
| **Thursday** | Product Spotlight | "Here's how Eddy tells you exactly when to float" (screenshot walkthrough) |
| **Friday** | Weekend Hype Post | "Weekend forecast: here's who's floating good 👀" (manual summary of auto data) |
| **Saturday** | Community Engagement | "First float of 2026 — where are you headed?" |
| **Sunday** | (Auto) Digest only | Let the automation run |

### Key Campaigns (March–May)

#### Campaign 1: "Is It Floatable Yet?" Series (March–April)
- Weekly post tracking river levels as spring progresses
- Use the Eddy otter moods (yellow = low, green = optimal) as visual hooks
- "Eddy's been watching the gauges so you don't have to. Here's this week's report."
- **Goal:** Establish Eddy as the go-to source before anyone else starts posting

#### Campaign 2: "First Float of the Season" (April–May)
- Countdown-style content as rivers become floatable
- "The Current River just hit Optimal for the first time this year! 🎉"
- Encourage followers to share their first float photos
- **Goal:** Create excitement and FOMO

#### Campaign 3: "New to Floating?" Series (April–May)
- Target first-timers who are planning their first float trip
- "Never floated before? Here's everything you need to know"
- Cover: what to bring, what to expect, how to read Eddy's conditions, shuttle logistics
- **Goal:** Capture the beginner audience that searches in spring

### Pre-Season Paid Strategy ($50–100/month)
- **Boost "First Float" announcement posts** when rivers hit optimal ($10–20 per boost)
- **Target:** 50-mile radius around each river, ages 21–45, interests: kayaking, canoeing, camping, outdoors
- **Boost the best-performing organic post each week** ($15–25/week)

---

## 6. Phase 2: Peak Season (June–August)

### Theme: "Float Smarter"

Everyone's floating now. Your automated posts do the heavy lifting. Manual content shifts to community building and showcasing the value of checking Eddy before heading out.

### Weekly Content Calendar

| Day | Post Type | Example |
|-----|-----------|---------|
| **Monday** | Weekend Recap | "Weekend river report: Current was 🔥, Meramec was packed, Jacks Fork surprised everyone" |
| **Tuesday** | Float Tip | "Pro tip: Check Eddy before you drive 2 hours to a river that's too low" |
| **Wednesday** | (Auto) + User Photo Share | Repost a follower's float photo with credit |
| **Thursday** | Weekend Preview | "Planning this weekend? Here's Eddy's top picks" (curated from auto data) |
| **Friday** | FOMO / Beauty Shot | Stunning river photo + "Conditions are perfect. See you out there." |
| **Saturday** | Community Poll/Question | "Most underrated Ozarks river? Go." |
| **Sunday** | (Auto) Digest | Let automation handle it |

### Key Campaigns (June–August)

#### Campaign 4: "Eddy's Weekend Picks" (Weekly, Fri morning)
- Curate the automated data into a human-written "Eddy recommends" post
- "This weekend: the Current is running optimal, Eleven Point is a hidden gem, skip the Meramec (too crowded)"
- **This is your highest-value manual content** — it's the editorial layer on top of raw data

#### Campaign 5: "Float Fails & Wins" (Community Series)
- "Tell us your worst shuttle story"
- "Best unexpected find on a float trip?"
- Encourage UGC (user-generated content) by resharing the best responses
- **Goal:** Build community, increase engagement rate, get shares

#### Campaign 6: "River of the Week" Spotlight
- Deep dive on one river per week
- History, best put-in/take-out combos, what makes it special
- Use Eddy's data: "The Eleven Point averages Optimal conditions 60% of summer — the most reliable river in Missouri"
- **Goal:** Educate, build authority, drive traffic to specific river pages

### Peak Season Paid Strategy ($100–200/month)
- **Boost "Weekend Picks" every Friday** ($20–30/week)
- **Run a "Plan Your Float" traffic campaign** to eddy.guide ($50–75/month)
  - Target: Missouri + surrounding states, 21–45, outdoor interests
  - Creative: Eddy otter graphic + "Stop guessing. Start floating." CTA
  - Objective: Link clicks to eddy.guide
- **Boost condition alerts** when a popular river hits "Optimal" ($5–10 per alert)

---

## 7. Phase 3: Shoulder Season (Sept–Oct)

### Theme: "Best Kept Secret Season"

Fall floating is underrated and your audience knows it. Fewer crowds, beautiful colors, and often great conditions.

### Key Content
- "Fall floating is the Ozarks' best-kept secret. Fewer crowds, perfect temps, and THIS." (fall foliage photo)
- "The season's not over — here's who's still running"
- "Eddy's Fall Float Guide: Which rivers hold up longest?"
- Season recap: "2026 by the numbers — most floated river, best conditions month, etc."
- Teaser for off-season: "See you next spring. Until then, Eddy's still watching the gauges."

### Shoulder Season Paid Strategy ($50/month)
- Boost 1–2 fall foliage river posts to capture the "fall trip" search intent
- Target broader: include hiking/camping audiences who might discover floating

---

## 8. Paid Promotion Strategy (Detailed)

### Budget Allocation

| Month | Budget | Focus |
|-------|--------|-------|
| March | $50 | Boost "season opener" content, build initial audience |
| April | $75 | Boost first optimal condition alerts, beginner content |
| May | $100 | Weekend picks boosts, traffic campaign starts |
| June | $150 | Full traffic campaign + weekly boosts |
| July | $200 | Peak spend — maximize traffic during highest-intent month |
| August | $150 | Continue traffic campaign, boost community posts |
| September | $75 | Fall content boosts |
| October | $50 | Wind down, season recap |

### Ad Targeting

**Core Audience (Save as Custom Audience):**
- Location: Missouri + 100mi radius of Ozarks rivers
- Extended: St. Louis, Kansas City, Springfield, Columbia MO, NW Arkansas metro areas
- Age: 21–55
- Interests: Kayaking, Canoeing, Float trips, Camping, Hiking, Missouri outdoors, Ozarks
- Exclude: People who already follow your page (for reach campaigns)

**Lookalike Audience (Build Over Time):**
- Once you have 100+ website visitors tracked via Meta Pixel, create a 1% lookalike
- This is your highest-ROI audience for traffic campaigns

### Ad Creative That Works
1. **Static image + clear CTA**: River photo → "Check live conditions → eddy.guide"
2. **Eddy otter graphics**: Mascot holding a sign with river conditions
3. **Screenshot walkthrough**: "Plan your float in 30 seconds" with app screenshots
4. **Condition alert style**: "🟢 Current River just hit Optimal. Plan your float →"

### Meta Pixel Setup (Important)
- Install Meta Pixel on eddy.guide to track visitors
- Set up events: PageView, ViewContent (river page), SelectPutIn, SelectTakeOut, SharePlan
- This enables retargeting and lookalike audiences — critical for scaling paid

---

## 9. Community & Growth Tactics

### Facebook Groups (Free, High Impact)
These are where Missouri floaters already hang out. Be a helpful presence, not spammy.

**Groups to join and participate in:**
- Missouri Float Trips
- Ozarks Paddlers
- Current River Float Trips
- Meramec River Floating
- Missouri Kayaking & Canoeing
- Ozark Trail & Outdoors
- Any local river-specific groups

**Strategy:**
- Share genuinely helpful answers when people ask "Is X river floatable this weekend?"
- Link to Eddy naturally: "I built a tool that tracks this — here's the Current River conditions right now: [link]"
- Share your daily digest posts in relevant groups (if group rules allow)
- **Never spam. Be the helpful local who just happens to have built a great tool.**

### Partnerships (Free / Trade)
- **Local outfitters**: Offer to embed Eddy's free widget on their website in exchange for a social media shoutout
- **Missouri tourism blogs**: Pitch "How to Plan the Perfect Ozarks Float Trip" guest post with Eddy link
- **Campground owners near rivers**: Cross-promote (they share Eddy, you mention their campground)
- **Local outdoor photographers**: Feature their river photos (with credit) in exchange for them sharing Eddy

### Hashtag Strategy (Instagram)

**Always use (already configured):**
- #eddysays #ozarksfloat #missourifloattrip #floattrip #ozarksrivers

**Add to manual posts:**
- #missourioutdoors #ozarkslife #midwestoutdoors #exploreozarks
- #kayaklife #paddling #riverdaytrip #getoutside
- #missouririver #ozarkbeauty #floatlife

**Seasonal:**
- Spring: #springpaddling #firstfloat #springrunoff
- Summer: #summerfloat #weekendvibes #riverlife
- Fall: #fallfloat #fallcolors #ozarkfall

---

## 10. Content Templates

### Template 1: River Condition Post (Manual Enhancement of Auto Posts)

```
🟢 Weekend Float Report

Eddy checked the gauges this morning. Here's the rundown:

✅ Current River — Optimal (3.2 ft) ← Eddy's Pick
✅ Eleven Point — Optimal (2.1 ft)
👍 Niangua — Okay (1.8 ft)
💧 Meramec — Low (1.1 ft) — skip it this weekend
⚠️ Jacks Fork — High (4.5 ft) — experienced only

Eddy's pick this weekend: Current River, Akers to Pulltite.
Perfect conditions, great weather, 4-hour float.

Plan your trip → eddy.guide

#ozarksfloat #missourifloattrip #floattrip #weekendfloat
```

### Template 2: Float Tip Post

```
Float Tip: The Shuttle Dilemma

Two-car shuttle? Outfitter shuttle? Drop-off service?

Here's how experienced Ozarks floaters handle it:

🚗 Two-car: Free, but you need a buddy with a vehicle
🚐 Outfitter shuttle: $15-25/person, stress-free
📍 Eddy shows you the exact drive-back time and distance

Pro tip: Always check shuttle availability BEFORE you drive to the river. Nothing worse than showing up with no way back.

Plan your shuttle → eddy.guide

#floattip #ozarksfloat #missourifloattrip
```

### Template 3: FOMO / Beauty Post

```
This is what "Optimal" looks like on the Current River.

Crystal clear water. Gentle current. Not a care in the world.

The Current is spring-fed, which means it flows even when other rivers are bone dry. It's the most reliable float in Missouri — and Eddy tracks it in real-time.

Conditions right now: ✅ Optimal
Float time (Akers → Pulltite): ~4 hours by canoe

Check live conditions → eddy.guide/rivers/current
```

### Template 4: Product Awareness Post

```
Planning a float trip used to mean:
❌ Calling 3 outfitters to ask about water levels
❌ Guessing based on last week's rain
❌ Showing up to a river that's too low to float

Now it means:
✅ Open eddy.guide
✅ See live conditions on all 8 Ozarks rivers
✅ Pick your put-in, get a float time estimate
✅ Share your plan with friends

Try it → eddy.guide
```

### Template 5: Community Engagement Post

```
Missouri Float Trip Debate 🔥

Most underrated Ozarks river. Go.

Our pick: Big Piney. Remote, uncrowded, flows through Mark Twain National Forest. It's like floating through a secret.

Drop yours below 👇
```

### Template 6: Rainy Season / Volatile Conditions Post (Great for NOW)

```
🌧️ Ozarks River Rollercoaster

This is why spring floating is an adventure:

Monday: Too Low
Wednesday: Optimal
Friday: HIGH WATER ⚠️

Rivers are moving fast right now. Don't drive 2 hours based on yesterday's conditions.

Eddy updates every hour with live USGS gauge data — so you always know before you go.

Check conditions → eddy.guide
```

---

## 11. Metrics & KPIs

### Track Weekly
| Metric | Target (Month 1) | Target (Month 3) | Target (Month 6) |
|--------|-------------------|-------------------|-------------------|
| **Facebook Page Followers** | +50 | +200 | +500 |
| **Instagram Followers** | +30 | +150 | +400 |
| **Avg Post Reach (FB)** | 200 | 500 | 1,500 |
| **Avg Post Reach (IG)** | 100 | 300 | 1,000 |
| **Website Clicks from Social** | 50/week | 150/week | 400/week |
| **Engagement Rate** | 3% | 5% | 5%+ |

### Track Monthly
- Top performing post (type, topic, reach)
- Best day/time for engagement
- Which rivers get the most engagement
- Cost per click (for paid campaigns)
- New followers growth rate

### Tools
- **Meta Business Suite** (free) — scheduling, insights, ad management
- **Google Analytics** (free) — track UTM-tagged traffic from social
- **Eddy Admin Dashboard** — post history, success/failure rates

---

## 12. Weekly Workflow (Solo Operator)

### Sunday Evening (30 min)
- [ ] Review last week's post performance in Meta Business Suite
- [ ] Note what worked (save as content inspiration)
- [ ] Draft 3–4 manual posts for the week ahead
- [ ] Schedule them using Meta Business Suite's scheduler

### Wednesday (15 min)
- [ ] Check automated post performance (admin dashboard)
- [ ] Respond to any comments/messages
- [ ] Share any standout auto-posts to relevant Facebook groups

### Friday Morning (15 min)
- [ ] Create and boost the "Weekend Picks" post
- [ ] Respond to engagement from the week
- [ ] Take note of any good user comments to feature later

### Ongoing (5 min/day)
- [ ] Respond to comments and DMs within 24 hours
- [ ] Share/engage with relevant community posts
- [ ] Screenshot or save good river photos people share for future use (with permission)

**Total time: ~2–3 hours/week**

---

## 13. Auto-Posting Config Recommendations

Based on the code review, here are specific config changes to consider:

### Immediate Changes

1. **Enable Instagram Feed Posts (not just Stories)**

   In `meta-client.ts`, the Instagram path currently uses `media_type: 'STORIES'`. For river highlights and digests, post to the feed instead — they're permanent, show captions, and are discoverable via hashtags. Reserve Stories for condition change alerts (time-sensitive, ephemeral).

2. **Add UTM Tracking to CTAs**

   In `content-formatter.ts`, update the CTA templates:
   ```
   // Before
   'Check live conditions → https://eddy.guide/rivers/{slug}'

   // After
   'Check live conditions → https://eddy.guide/rivers/{slug}?utm_source={platform}&utm_medium=social&utm_campaign=eddy_auto'
   ```

3. **Expand the Engagement Questions Pool**

   In `content-formatter.ts`, add more variety to `ENGAGEMENT_QUESTIONS`:
   ```
   'Drop a 🛶 if you floated this week.',
   'Best put-in on {river}? Go.',
   'Float trip snack tier list — what's S-tier?',
   'Name a better feeling than putting in on a perfect day. We'll wait.',
   ```

4. **Add a "Weekend Preview" Auto-Post**

   Consider adding a new post type that runs Friday morning — a curated summary of which rivers are looking best for the weekend. This could be generated from the same data as the digest but with weekend-specific framing.

### Seasonal Config Toggles

Use the `social_custom_content` table to rotate seasonal CTA snippets:

| Season | Snippet | Active Dates |
|--------|---------|-------------|
| Spring | "Spring runoff means conditions change fast. Check Eddy before you go." | Mar 1 – May 15 |
| Early Summer | "Float season is here! Plan your first trip →" | May 15 – Jun 30 |
| Peak Summer | "Beat the crowds — Eddy shows you the hidden gem rivers" | Jul 1 – Aug 15 |
| Fall | "Fall floating = fewer crowds, perfect temps, amazing colors" | Sep 1 – Oct 31 |
| Off-Season | "Rivers rest. Eddy doesn't. Still tracking conditions all winter." | Nov 1 – Feb 28 |

### Posting Schedule Optimization

Current schedule has rivers posting at 30-min intervals starting at 7 AM CST. This is solid, but consider:

- **Move weekend posts 1 hour later** (already done — 9 AM vs 7 AM) ✅
- **Add a Thursday evening highlight** for the most popular river (Meramec or Current) to catch weekend planners
- **Reduce weekday posts for less popular rivers** (Big Piney, Huzzah, Courtois) to 3x/week instead of daily — saves your posting quota for boosted content

---

## Quick-Start Checklist

### This Week
- [ ] Verify Facebook Page and Instagram Business accounts are properly linked
- [ ] Confirm Meta API tokens are active (check admin dashboard)
- [ ] Enable auto-posting if not already on
- [ ] Create your first manual "rainy season river rollercoaster" post (Template 6 above)
- [ ] Join 3–5 Missouri float trip Facebook groups
- [ ] Install Meta Pixel on eddy.guide (if not done)

### This Month
- [ ] Establish consistent manual posting (4–6 manual posts/week)
- [ ] Boost your best-performing post each week ($15–25)
- [ ] Build a photo library of river shots for future posts
- [ ] Set up UTM tracking on all social CTAs
- [ ] Create a "New to Floating?" carousel or series

### By Float Season (May)
- [ ] Have 30+ posts published across both platforms
- [ ] Running a $50–75/month traffic campaign to eddy.guide
- [ ] Active presence in 5+ Missouri float trip Facebook groups
- [ ] At least one outfitter partnership / widget embed live
- [ ] Meta Pixel collecting data for future lookalike audiences

---

*This plan is designed for a solo operator with a small budget. The automated posting system handles 70% of the work — your job is the 30% that adds personality, community, and strategic promotion on top of it.*
