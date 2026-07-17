# Eddy widget outreach emails

Rich, paste-ready HTML emails that showcase the eddy.guide embed widgets, split by audience so each send leads with the one widget that fits.

| Send to | File | Leads with |
|---|---|---|
| **Outfitters** | `email-outfitters.html` | Float Trip Planner (booking driver) + Live Conditions, Multi-River, Services |
| **Campgrounds, cabins & Airbnbs** | `email-campgrounds-airbnbs.html` | "Floatable From Here" card + Live Conditions, Eddy's Daily Read, Badge |
| _Mixed list / general_ | `widget-showcase-email.html` | All eight widgets in one (the original all-in-one) |

All three share the Eddy brand design, real widget screenshots (`missouri-float-planner/public/email/*.png`, served at `https://eddy.guide/email/<name>.png` after deploy), and real Eddy otter art.

> **Deploy this branch before sending.** The screenshots only exist at `eddy.guide/email/*.png` once deployed. Until then, preview with an images-inlined copy. Otter art is already hosted and loads anywhere.

---

## Subject lines (A/B test)

**Outfitters**
1. `A free float-trip planner for {{BusinessName}}'s website`
2. `Turn website visitors into booked floats (free, 2-min setup)`
3. `Let visitors plan their float on your site — and book with you`
4. `Free live {{River}} conditions + a trip planner for your site`

**Campgrounds / cabins / Airbnbs**
1. `A free "can we float today?" card for {{BusinessName}}`
2. `Answer your guests' #1 question, right on your listing`
3. `Free live river conditions for your guests (2-min setup)`
4. `Is the river floatable from {{BusinessName}}? Put the answer on your page`

**Preheaders** are already embedded in each file's hidden preview text.

---

## Personalization tokens

Find-and-replace before sending (or map to merge fields):

| Token | Replace with |
|---|---|
| `{{FirstName}}` | Recipient's first name |
| `{{BusinessName}}` | Their business name |
| `{{River}}` | Their closest river (subject lines only) |
| `{{YourName}}` | Your name |
| `{{YourMailingAddress}}` | A mailing address (CAN-SPAM) |

The screenshots use sample rivers (Current, Jacks Fork). Leave them as illustrative examples, or swap a PNG in `public/email/` for the recipient's home river.

---

## The widgets (quick reference)

| Widget | One-liner | Featured in |
|---|---|---|
| **Floatable From Here** | "Is it floatable from here?" + nearest launch, drive time, your booking button | Campgrounds/Airbnbs (lead) |
| **Float Trip Planner** | Put-in/take-out → shuttle, float time, outfitters on the stretch | Outfitters (lead) |
| **Live Conditions** | Gauge, weather, condition badge, 14-day trend | Both |
| **Multi-River Overview** | Live rows for several rivers at once | Outfitters |
| **Services Directory** | Nearby outfitters/campgrounds/lodging, tap-to-call | Outfitters |
| **Eddy's Daily Read** | Plain-language float / no-float verdict | Campgrounds/Airbnbs |
| **Condition Badge** | Compact inline live status dot | Campgrounds/Airbnbs |
| **Gauge Report** | 7/14/30-day gauge chart + weekly read | _(text mention — see bug note)_ |

Free · light & dark themes · auto-resize · optional co-branding (logo, color, "via {{BusinessName}}") · works on WordPress, Squarespace, Wix, or any "Custom HTML" block.

---

## Plain-text fallbacks

Include a text alternative for deliverability. Two versions:

### Outfitters
```
Hi {{FirstName}},

I built Eddy (https://eddy.guide) to give Missouri floaters honest, real-time
river conditions from live USGS gauges -- one rating from "Flowing" to "Too Low."

For an outfitter like {{BusinessName}}, the useful part is what it does on YOUR
page. I have a set of FREE, embeddable widgets:

- Float Trip Planner -- visitors pick a put-in and take-out and see shuttle
  distance, float time, live conditions, and a drive route, then book with you.
- Live Conditions -- gauge, weather, condition badge, 14-day trend.
- Multi-River Overview -- live conditions for every river you run, in one board.
- Services Directory -- outfitters with tap-to-call and reservation links (reply
  and I'll make sure {{BusinessName}}'s listing is right).

Every widget is free, comes in light & dark, and can carry your logo, color, and
a "via {{BusinessName}}" credit.

Setup takes ~2 minutes: pick your widget at https://eddy.guide/embed, copy the
snippet, paste it into any page (WordPress, Squarespace, Wix, anything).

See it live: https://dillardmill.com/floating

One favor: if a rating ever doesn't match what you're seeing at the ramp, just
reply -- that ground-truth is how I dial in each gauge.

Tight lines,
{{YourName}}
https://eddy.guide

--
You run a float outfit in the Missouri Ozarks. Not a fit? Reply "no thanks."
{{YourName}} · {{YourMailingAddress}}
```

### Campgrounds / cabins / Airbnbs
```
Hi {{FirstName}},

I built Eddy (https://eddy.guide) to give Missouri floaters honest, real-time
river conditions from live USGS gauges -- one rating from "Flowing" to "Too Low."

Guests booking {{BusinessName}} almost always want to know one thing first: is
the river good right now? I have FREE widgets that put that answer on your
listing:

- Floatable From Here -- pin your address once and a card tells guests if the
  nearest river is floatable now, with the launch, a real drive time, and YOUR
  booking button.
- Live Conditions -- gauge, weather, condition badge, 14-day trend.
- Eddy's Daily Read -- a plain-language float / no-float verdict.
- Condition Badge -- a tiny live status dot for a sidebar or confirmation email.

Every widget is free, comes in light & dark, and can carry your logo, color, and
a "via {{BusinessName}}" credit.

Setup takes ~2 minutes: build your card at https://eddy.guide/embed, copy the
snippet, paste it into your listing or site.

See it live: https://dillardmill.com/floating

One favor: if a rating ever doesn't match what you're seeing on the water, just
reply -- that ground-truth is how I dial in each gauge.

Tight lines,
{{YourName}}
https://eddy.guide

--
You host guests near a Missouri float river. Not a fit? Reply "no thanks."
{{YourName}} · {{YourMailingAddress}}
```

---

## Sending tips

- **Deploy before you send**, then send yourself a test to confirm every `eddy.guide/email/*.png` loads.
- **Images off by default:** every image has descriptive alt text, so both emails read and sell with images blocked.
- **Gmail clipping:** each email is well under Gmail's ~102 KB HTML limit (images are external, they don't count).
- **From a real person** ("Built you a free planner" from your name) out-opens a branded no-reply sender for cold outreach.
- **Swap in your own examples:** replace a PNG in `public/email/` (keep the filename) to feature a different river — or a card branded for a specific prospect — with no HTML change.
- **Follow-up** after ~5 days with a one-liner tends to convert well.
- **CAN-SPAM:** keep the opt-out line + a mailing address in the footer.

---

## Asset notes

- **Screenshots** (`public/email/`): `card.png`, `live-conditions.png`, `planner.png` (a realistic ~9.8 mi / ~5 hr Current River float), `multi-river.png`, `eddy-quote.png`, `services.png`, `badge.png`. Real widgets, real conditions, captured at 2× for retina sharpness.
- **Demo card:** the "Floatable From Here" screenshot uses a throwaway embed card created via the public API (`emb_324932fe`, Eminence MO → Jacks Fork, branded "Riverside Retreat"). Delete it whenever, or regenerate `card.png` branded for a real prospect.
- **Heads-up (product bug):** the **Gauge Report** widget's big headline number renders wrong — it showed `1`–`3 cfs` while the chart and "Eddy Says" line correctly read ~123 / ~1,010 cfs. That's why the Gauge Report isn't featured as a screenshot (only mentioned in text). Looks like the headline is pulling the wrong field or a rounded delta — worth a fix in the widget.
