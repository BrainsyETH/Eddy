# eddy.guide — Business Strategy & Growth Analysis

> Strategic analysis for a solo, employed founder. Prepared 2026-07-01.
> Grounded in the actual codebase (153 Supabase migrations, live features), the founder's own
> 75-business outreach database, and external market research. Estimates are flagged as such;
> cited figures link to sources.

---

## 0. Objective assumption (you left this blank — this is Open Question #1)

The objective "changes everything," and you didn't fill it in. Given the operator reality
(solo founder, full-time job, time and capital both scarce), I'm running the analysis under this
**default**: *meaningful side-project cash flow within 12 months, that could become a sellable
asset, on a near-zero-cash / sweat-only budget.* If your real objective is venture-scale or a
full-time lifestyle business, redirect me — Section 5 gives you the branch points.

---

## 1. Verdict

eddy.guide is a genuinely excellent, **over-engineered consumer utility for a small, seasonal,
single-region market** — and that mismatch is the whole story. You've built a 153-migration
product with AI conditions reports, an embeddable widget system, an agentic-payment rail, and a
video pipeline, aimed at ~75–150 mostly phone-only businesses and a floater audience that will
never pay because USGS is free. **The uncomfortable truth: engineering is not your constraint —
demand capture and willingness-to-pay are, and almost none of your monetization experiments
(x402, paid widget SaaS) survive contact with how this market actually spends money.** This
market pays for *customers*, not *tools* (see: FareHarbor giving software away free and taking
6% of bookings). The single highest-leverage move is to stop building and instead prove one
thing: that your calibrated "is-it-floatable-right-now" answer can **capture high-intent demand
(SEO + AI answers) and route it to outfitters/rentals who will pay for that demand** — with the
free widget as a distribution flywheel, not a product you sell.

---

## 2. Diagnosis

### 2a. Who pays, and why — ranked by *willingness × ability*

| Payer | Will they pay? | For what? | Verdict |
|---|---|---|---|
| **Floaters (consumers)** | ❌ Almost never | A planning tool | USGS/NOAA are free; free FB groups + outfitter phone lines cover the rest. Monetize their *attention/intent*, never their wallet. |
| **Outfitters** | ⚠️ Not for tools, **yes for customers** | Bookings / qualified leads / featured placement | FareHarbor proved this market takes free software and pays a **6% take on bookings** ([source](https://automate.travel/blog/fareharbor-pricing-guide-2026/)). They pay for heads, not dashboards. |
| **Campgrounds / RV parks / vacation rentals** | ⚠️ Same | Heads-in-beds, referrals | Pine Valley (your reference customer) is exactly this — a rental's willingness is tied to bookings, not to a conditions widget. |
| **DMOs / tourism boards (VisitMO, county CVBs)** | ⚠️ Slowly, small $ | Content, visibility, sponsorship | Real budgets but relationship-driven, long cycles, grant-shaped money. A *later* line, not a wedge. |
| **Other apps / AI agents (x402)** | ❌ ~$0 today | Per-query data | There is no fleet of agents willing to pay $0.01 for Missouri river data. A tech demo, not a market. |

**Blunt take:** the only two payers that matter in a 12-month window are outfitters and
lodging — and they pay for **demand, not software.** Every strategy that asks them to pay a
monthly SaaS fee is swimming upstream against how they already buy.

### 2b. Market size & shape — a great niche that is genuinely small

- **Supply side (your customers):** Your own database = **75 float businesses across 6 corridors**,
  **~40% phone-only**, most on GoDaddy/Wix/static sites (compass artifact). Statewide, generously
  ~150–250 outfitters/campgrounds/rentals *(estimate)*. This is a **thin B2B market** — you can
  count your entire TAM by hand.
- **Demand side (your funnel):** Ozark National Scenic Riverways alone drew **~1.3M visitors in
  2023**, who spent **$66.8M locally**, supporting 908 jobs
  ([NPS](https://www.nps.gov/ozar/learn/news/tourism-to-ozark-national-scenic-riverways-contributes-$76-8-million-to-local-economy.htm)).
  That's just Current + Jacks Fork. Statewide float tourism is a healthy multiple of that. **Your
  demand pool is large; your supply pool is tiny.** That asymmetry is the strategic tell — the
  value is in the *demand you can aggregate*, not the *businesses you can bill*.
- **Shape:** strongly seasonal (Apr–Oct, weekend- and weather-driven per `EDDY_KNOWLEDGE.md`),
  single-region. Revenue will be spiky. Any subscription you sell gets cancelled every October.

**Paid-widget TAM math (all estimates, to show the ceiling):** 150 businesses × 30% adoption ×
$30/mo × 7-month season ≈ **$9.5k/yr**. Wildly optimistic (100 payers × $300/yr) ≈ **$30k/yr** —
and that's *before* the fight against the "free" expectation. That is a hobby line, not a
business. **This is the number that kills the paid-SaaS-widget thesis.**

### 2c. Moat — real, but narrower than it looks

- **Real and hard to copy:** `EDDY_KNOWLEDGE.md` + per-river **calibrated gauge thresholds**
  (6-tier floatability, proxy-gauge relationships like Huzzah→Courtois, spring-vs-rain recovery
  dynamics, nearest-town logistics). This is genuine local authority that a scraper can't
  reproduce, and it's what lets you answer *"can I float this weekend?"* — the question USGS
  refuses to answer.
- **Where it erodes:** the raw-data layer is a commodity, and **competitors already rank for your
  exact queries** — `missourigreatoutdoors.com/meramec-river-levels` ("Live USGS Gauge for
  Floaters"), `missouriscenicrivers.com/current-river-levels`, `snoflo.org`, plus NOAA/USGS
  themselves. Local Facebook groups and the outfitter's own phone line are the incumbent
  "conditions API." **Your moat is the *interpretation* (floatable/not, why, what to do), not the
  data.** Positioning must lean hard on the judgment layer or you're just a nicer USGS reader in a
  crowded field.

### 2d. Competition & alternatives (what floaters/businesses use today)

- **Conditions:** USGS/NOAA (free, authoritative, ugly), snoflo, riverweather, missourigreatoutdoors,
  missouriscenicrivers, and — critically — **the outfitter's own phone line and Facebook page**.
- **Booking/leads:** FareHarbor, ResNexus, Airbnb/VRBO, Hipcamp, RoverPass, or just the phone
  (per your DB, phone/direct is the single most common channel).
- **The wedge:** nobody owns the **"is [river] floatable *this weekend*, and who do I call"**
  moment with authority + a booking hand-off. USGS won't editorialize; the FB groups are noise;
  the outfitters only speak for themselves. That decision-moment is your opening.

---

## 3. Opportunity matrix (by lever)

Scores: Upside / Effort / Time-to-revenue. **★ = top 3.**

### Monetization models

| Opportunity | Tied to asset | Upside | Effort | Time-to-$ | Note |
|---|---|---|---|---|---|
| **★ Outfitter/rental lead-gen + featured placement** | Warm 75-list, SEO pages, Pine Valley | **High** | Low–Med | **Fast** | Market already pays for customers. No Stripe needed to start (tracked links + seasonal placement fee/rev-share). |
| Booking affiliate / referral rev-share | Access-point DB, river pages | Med–High | Med | Med | Depends on outfitter booking tech; many are phone-only (attribution is the hard part). |
| B2B widget subscription (SaaS) | Widget system (built) | **Low** (~$10–30k/yr ceiling) | High (sales + you'd need Stripe) | Slow | Fights "free" norm; vitamin not painkiller. **Use the widget free, as distribution.** |
| Data/API licensing ("authoritative conditions API") | Calibrated thresholds, PostGIS | Low–Med | Med | Slow | Who buys? Weather apps won't pay for 9 MO rivers. Niche. |
| x402 agentic "answer machine" | x402 rail (built) | **~Zero (today)** | Already built | N/A | No agent demand exists. **Park it.** |
| DMO / tourism-board sponsorship | Content engine, authority | Med | Med (relationships) | Slow | Real budgets, slow cycles. Later. |
| Premium consumer membership (alerts) | Email capture, thresholds | Low | Low | Med | "Text me when the Jacks Fork is floatable." Tiny ceiling; cheap to test. |

### Distribution & growth loops

| Opportunity | Tied to asset | Upside | Effort | Time-to-$ | Note |
|---|---|---|---|---|---|
| **★ SEO on high-intent long-tail ("is [river] floatable this weekend")** | Calibrated thresholds, `/rivers/[slug]`, blog CMS, Eddy Says | **High** | Med (compounding) | Med | The one lever a cashless solo founder can compound alone. Directly monetizable via lead-gen. Competitors prove the traffic is real. |
| **★ Free "conditions badge" widget as flywheel** | Embed system (built), warm list | **High** | Low | Indirect | Outfitter embeds free badge → their visitors see "powered by eddy.guide" → traffic compounds → more leads to route. Distribution, not a product. |
| Automated social pipeline ("Huck") | ClipEngine/Remotion (built) | Med | **Sunk, but high ongoing eng drain** | Indirect | Fine as top-of-funnel *if it runs itself*. **Stop engineering it.** |
| Warm 75-outfitter list as launch channel | The list (built) | Med–High | Low | Fast | Your single best BD asset. Use it for the lead-gen pilot, not a SaaS pitch. |
| Pine Valley as lighthouse reference | Owned customer | Med | Low | Fast | Prove the rental lead-gen loop here first, then sell the case study. |

### Expansion (sequence behind proof)

| Opportunity | Upside | Effort | Time-to-$ | Note |
|---|---|---|---|---|
| +Rivers (Gasconade, Black, North Fork) | Med | Med (playbook exists) | Slow | Grows the *demand surface*, not revenue directly. Do it only to feed a proven money loop. |
| New float region (clone playbook) | High (if model works) | High | Slow | The real scale story — but **only after** the home market prints money. |
| Data-product axis | Low–Med | Med | Slow | Speculative. Ignore for now. |

---

## 4. Recommended strategy

### The wedge (one thing)

> **Own the "is [river] floatable right now / this weekend — and who do I book?" moment.**
> Capture that high-intent demand via SEO + your "Eddy Says" answer layer, and monetize it by
> **routing floaters to outfitters/rentals who pay for the customer** (featured placement +
> tracked referral / rev-share). The free conditions widget is your distribution flywheel, not a
> product you sell.

**Why this wedge beats the alternatives for *this* founder and objective:**
- It's the only lever a solo, employed, cashless founder can **compound with sweat alone** —
  content + the existing cheap generation engine, no sales calls squeezed around a day job.
- It monetizes the **large side** of your asymmetry (1.3M+ visitors of demand) instead of the
  **tiny side** (75–150 billable businesses).
- It leans on your **actual moat** (the floatable/not judgment) against USGS-reader competitors.
- It needs **no Stripe and no SaaS motion** to start — referral placement can be a handshake +
  tracked links + a small seasonal featured-listing fee.
- It turns the already-built widget and content pipeline into **distribution**, salvaging that
  sunk investment instead of forcing it to be a revenue product it can't be.

### The riskiest assumption

**That you can capture enough high-intent demand that routing it is worth real money to an
outfitter/rental** — i.e., (a) your pages/answers can actually rank and win the decision moment,
and (b) a business will pay for an attributed lead or featured slot. If either half is false, the
wedge fails.

### The cheapest possible test (run both in parallel, ~30–60 days, ~$0)

1. **Traffic-truth check.** Instrument analytics *today* (Open Question #2: what's your current
   organic traffic?). Publish a batch of ~20 long-tail conditions pages via the content engine —
   *"Is the Jacks Fork floatable this weekend?"*, *"Current River level right now — can you
   float?"* — and watch rankings/clicks for 6–8 weeks. **Kill signal:** no ranking movement and
   flat high-intent traffic → SEO wedge is weaker than hoped, reconsider.
2. **Pay-for-demand check.** Take 5 businesses off the warm list (include Pine Valley). Offer a
   **season-long featured placement + tracked "Book/Call" referral** on the relevant river page —
   free or nominal to start, with the explicit ask: *"if we send you customers, will you pay for
   featured placement next season?"* **Advance signal:** ≥3 say yes and 1–2 convert to a paid slot
   or rev-share. **Kill signal:** you can't get 3 businesses to value referred customers → the
   money path is weaker than the FareHarbor analogy suggests; pivot toward pure-traffic/ad or
   reconsider the whole thesis.

### Phased roadmap

**Next 30 days — instrument & seed (know your truth):**
- Turn on real analytics; establish the baseline (traffic, top pages, high-intent queries).
- Ship ~20 high-intent "floatable this weekend / level right now" pages via the content engine.
- Add a tracked **"Book / Call this outfitter"** CTA to river + access pages.
- Pitch the 5-business featured-placement/referral pilot (warm list + Pine Valley).
- **Explicitly stop:** new x402 work, new-river onboarding, Huck/ClipEngine feature work.

**Next 90 days — prove the loop:**
- Read the two tests. Did conditions pages rank? Did any pilot business *see and value* referred
  customers? Convert 1–2 to a paid featured slot or rev-share.
- Ship the **free conditions badge widget** to the warm list as pure distribution ("free, forever,
  makes your site look pro") — measure referral traffic back.
- **Decision gate:** Is lead-gen real (≥1 paying business + measurable referred bookings)? Yes →
  systematize. No → pivot to Section 5 alternatives or reassess the objective.

**Next 365 days — compound (only if the loop is proven):**
- Roll featured-placement/referral across the 75-list corridor by corridor.
- Add the **highest-demand expansion rivers** (Gasconade, Black, North Fork) *to widen the demand
  surface that already monetizes* — not before.
- Only after the home market prints steady in-season cash: pilot **one** new float region with the
  clone playbook. Approach a DMO for a sponsorship now that you have traffic + case studies.
- **Target:** a few $k/month in-season from placements/referrals, plus a compounding, defensible
  traffic + data asset that is genuinely **sellable** — satisfying both the cash-flow and
  sellable-asset objectives.

### What to explicitly NOT do right now (and why)

- **Don't build a paid SaaS widget.** ~$10–30k/yr ceiling, fights the "free" norm, needs a sales
  motion and a billing system you haven't built. Give the widget away as distribution instead.
- **Don't invest another hour in x402 / agentic payments.** Zero addressable demand today; it's a
  bet on a future that, even if it arrives, won't route meaningful volume through 9 Missouri rivers.
- **Don't keep engineering Huck/ClipEngine.** It's a real top-of-funnel asset — but it's also a
  time sink competing with your actual bottleneck (demand + money). Freeze features; let it run.
- **Don't add more rivers yet.** More supply of *data* doesn't fix an unproven *money* loop. Rivers
  are behind the proof gate.
- **Don't chase DMOs as a primary line.** Long cycles, small money — worth it only once you have
  traffic and case studies to sell them.

---

## 5. Options & tradeoffs (choose your path)

Three genuinely different games. My recommendation is **Path A**, but the right pick depends on
your true objective (Open Question #1).

### Path A — Demand-capture & lead-gen marketplace *(recommended)*
- **Bet:** Aggregate floater intent (SEO + Eddy Says + widget flywheel); monetize by routing it to
  outfitters/rentals via featured placement + referral rev-share.
- **Optimizes:** cash timeline, fit to how this market actually buys, solo-founder sweat-scalability,
  no Stripe/SaaS overhead, and a compounding sellable asset.
- **Sacrifices:** requires you to *win traffic* (the hard, uncertain part); attribution is messy
  with phone-only outfitters; ceiling is regional until you clone the playbook.
- **Best if your objective is:** side-project cash flow and/or a sellable asset (the default).

### Path B — B2B tool business (widget / "answer machine" SaaS)
- **Bet:** Sell outfitters a paid conditions widget + reduce-the-phone-calls tooling.
- **Optimizes:** recurring revenue *if* it works; clean B2B story; uses the built widget directly.
- **Sacrifices:** collides with FareHarbor-trained "free tools" expectations; ~$10–30k/yr TAM
  ceiling; demands a sales motion + billing infra you'd build around a day job; churns every winter.
- **Best if:** you have private signal I don't (e.g., outfitters already asking to *pay*), or your
  objective is a clean, small, sellable SaaS and you accept the low ceiling.

### Path C — Authoritative conditions data/API infrastructure (incl. x402)
- **Bet:** Become the canonical machine-readable "floatability" layer; license data / earn
  per-query (x402 or normal API keys).
- **Optimizes:** leverages the calibrated-thresholds moat; highest *theoretical* scale if agentic
  payments and third-party demand ever materialize.
- **Sacrifices:** **no demand exists today**; 9 Missouri rivers is too niche to be a serious API
  product; this is a research bet, not a 12-month cash path for a solo founder.
- **Best if:** your objective is venture-scale and you're willing to fund years of "too early."

---

## 6. Open questions (what I need to sharpen this)

1. **Objective (the real one).** Side-project cash / sellable asset / venture-scale / lifestyle?
   And true horizon + capital appetite. This re-ranks everything.
2. **Current traffic.** What does analytics actually say — sessions, top pages, high-intent organic
   share? This single number governs whether Path A is viable *today* or needs a runway.
3. **Any existing revenue or paid pilots?** Is Pine Valley (or anyone) paying? Any widget in the
   wild being paid for? Any x402 calls that settled? Changes the "what's real" baseline.
4. **Realistic weekly hours** you can put in around the job — determines how many bets you can run
   (my read: one, maybe two).
5. **Truly sweat-only, or is there a small cash budget** (e.g., for a few paid content pushes or a
   VA to work the 75-list)?
6. **Warm relationships beyond the cold list** — any outfitter/rental who already knows and likes
   you? That's where the pay-for-demand test should start.

---

### Sources
- NPS — ONSR tourism economics (1.3M visitors, $66.8M, 2023): https://www.nps.gov/ozar/learn/news/tourism-to-ozark-national-scenic-riverways-contributes-$76-8-million-to-local-economy.htm
- FareHarbor pricing / take-rate model: https://automate.travel/blog/fareharbor-pricing-guide-2026/
- Competing MO conditions sites: https://www.missourigreatoutdoors.com/meramec-river-levels/ , https://missouriscenicrivers.com/current-river-levels , https://snoflo.org/report/flow/missouri/
- Missouri Canoe & Float Association directory (supply-side): https://missouricanoe.org/directory/
- Internal: `compass_artifact…md` (75-business database), `EDDY_KNOWLEDGE.md`, `docs/RIVER_SCALING_PLAYBOOK.md`, codebase (`src/app/**`, `src/app/.well-known/x402/route.ts`, `src/app/embed/**`, no Stripe/billing present).
</content>
</invoke>
