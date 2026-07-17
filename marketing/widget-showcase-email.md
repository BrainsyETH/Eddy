# Eddy widget showcase email — sending kit

Companion to **`widget-showcase-email.html`** (the rich, paste-ready HTML email).
Everything here is copy you can lift straight into Gmail, Mailchimp, Instantly, Apollo, etc.

> **The widget images are real screenshots** of the live widgets (captured with real conditions), stored in `missouri-float-planner/public/email/` and referenced in the email as `https://eddy.guide/email/<name>.png`. **They go live the moment this branch is deployed** — until then those URLs 404, so preview with the self-contained copy (all images inlined) rather than the raw file. The Eddy otter art is served from the existing Vercel Blob store and already loads anywhere.

---

## 1. Subject lines (A/B test these)

Short, curiosity- or value-led, no spam-trigger words:

1. `A free "can we float today?" widget for {{BusinessName}}`
2. `Free live river conditions for your website (2-min setup)`
3. `Your guests keep asking if the river's floatable — here's a free answer`
4. `Put live {{River}} conditions on your site — free`
5. `{{BusinessName}} + live Ozark river conditions = happier guests`
6. `Built you a free river-conditions widget` *(warmest / most personal)*

**Preview / preheader text** (the gray line after the subject — already embedded in the HTML, repeated here if your tool asks for it separately):
> Live USGS river conditions, a float-trip planner, and a "floatable from here" card — free, no account, works on any website.

---

## 2. Personalization tokens

Find-and-replace these before sending (or map them to merge fields in your email tool):

| Token | Replace with | Appears |
|---|---|---|
| `{{FirstName}}` | Recipient's first name | Greeting |
| `{{BusinessName}}` | Their business name | Intro, mockups, co-branding, footer |
| `{{River}}` | Their closest river (subject line option 4) | Subject only |
| `{{YourName}}` | Your name | Sign-off + footer |
| `{{YourMailingAddress}}` | A mailing address | Footer (CAN-SPAM) |

> The mockups use sample rivers/values (Current, Meramec, Jacks Fork). You can leave those as-is (they read as examples) or swap them for the recipient's home river for extra relevance.

---

## 3. Per-audience swap (optional, high-impact)

The email already maps every business type to its best widget. For a tighter, single-focus version, replace the intro's second paragraph ("Your visitors to {{BusinessName}}…") with the matching line below and lead the gallery with that widget:

- **Outfitter** → *"Visitors who can plan a float on your site are visitors who book one. The planner lets them pick a put-in and take-out, see shuttle distance and float time, and land on your outfit — without leaving your page."*
- **Campground** → *"Guests deciding between campgrounds want to know one thing: is the river floatable from here? The 'Floatable From Here' card answers that with your nearest launch and a real drive time from your gate."*
- **Airbnb / cabin** → *"'Can we float during our stay?' is the #1 question in your inbox. Put the answer right on your listing so guests self-serve — and book with confidence."*
- **Blog / tourism** → *"Drop a live condition badge or a multi-river overview into any post. It's always current with zero maintenance — no more stale 'call ahead for conditions' lines."*

---

## 4. The eight widgets (quick reference)

| Widget | One-liner | Best for |
|---|---|---|
| **Floatable From Here** `NEW` | "Is it floatable from here right now?" + nearest launch, real drive time, your booking button | Campgrounds, cabins, Airbnbs |
| **Live Conditions** `REC` | Gauge readings, weather, condition badge, 14-day trend | Everyone (all-rounder) |
| **Float Trip Planner** | Pick put-in/take-out → shuttle miles, float time, outfitters on the stretch | Outfitters |
| **Services Directory** `NEW` | Nearby outfitters, campgrounds & lodging with tap-to-call + reservation links | Regional / lodging pages |
| **Multi-River Overview** `NEW` | Live condition rows for several rivers at once | Multi-river outfitters, tourism |
| **Gauge Report** | 7 / 14 / 30-day gauge chart + Eddy's weekly read | Data-minded visitors |
| **Eddy's Daily Quote** | Plain-language read + clear float / no-float verdict | Lodging, outfitters |
| **Condition Badge** | Compact inline status dot + river name | Blog posts, sidebars, footers |

All free · light & dark themes · auto-resize · optional co-branding (logo, color, "via {{BusinessName}}" credit) · works on WordPress, Squarespace, Wix, or anything with a "Custom HTML" block.

---

## 5. Plain-text fallback

Good senders include a plain-text alternative (better deliverability, and some readers prefer it). Paste this as the text part:

```
Hi {{FirstName}},

I built Eddy (https://eddy.guide) to give Missouri floaters honest, real-time
conditions for rivers like the Current, Jacks Fork, Meramec, Eleven Point,
Huzzah, Courtois, Niangua, and Big Piney. It reads every USGS gauge and turns
the numbers into one glanceable rating -- from "Flowing" to "Too Low."

Your visitors to {{BusinessName}} are already wondering if the water's good.
I have a set of FREE widgets that answer that for them, right on your site, and
keep it current automatically:

- Floatable From Here -- "is it floatable from here right now?" with your
  nearest launch, a real drive time, and YOUR booking button. (Campgrounds,
  cabins, Airbnbs.)
- Live Conditions -- gauge readings, weather, condition badge, 14-day trend.
- Float Trip Planner -- visitors pick a put-in and take-out and see shuttle
  distance, float time, and the outfitters on that stretch. (Outfitters.)
- Plus: Services Directory, Multi-River Overview, Gauge Report, Eddy's Daily
  Quote, and a compact Condition Badge.

Every widget is free, comes in light & dark, and can carry your logo, color,
and a "via {{BusinessName}}" credit.

Setup takes about 2 minutes:
  1. Pick your river & widget at https://eddy.guide/embed
  2. Copy the small snippet of code
  3. Paste it into any page (WordPress, Squarespace, Wix, anything)

See it live on Dillard Mill's floating page: https://dillardmill.com/floating

One favor: nobody knows these rivers better than the people on them every day.
If a rating ever doesn't match what you're seeing on the water, just reply and
tell me -- that ground-truth is how I dial in each gauge.

Happy to help you get set up -- just reply.

Tight lines,
{{YourName}}
https://eddy.guide

--
You're receiving this because you run a float-friendly business in the Missouri
Ozarks. Not a fit? Reply "no thanks" and I won't reach out again.
{{YourName}} · {{YourMailingAddress}}
```

---

## 6. Sending tips

- **Test render first.** Send yourself a copy and check Gmail (web + app), Apple Mail, and Outlook. The rich card degrades gracefully in Outlook (square corners, no shadows) but stays readable.
- **Gmail clipping.** This email is well under Gmail's ~102 KB clip limit. If you add a lot more, watch for a "[Message clipped]" link.
- **Deploy before you send.** The widget screenshots live at `https://eddy.guide/email/*.png`, which only exist once this branch is deployed. Send yourself a test after deploy to confirm every image loads.
- **Images off by default.** Every image has descriptive alt text, so the email still reads and sells with images blocked. The showcase images are real widget screenshots; the otter art and logo are the only illustrations.
- **Swap in your own examples anytime.** To feature a different river or a card branded for a specific prospect, replace the matching PNG in `public/email/` (keep the filename) — no HTML change needed.
- **Links.** All CTAs point to `https://eddy.guide/embed`. Swap in UTM tags if you want to track this campaign (e.g. `?utm_source=outreach&utm_medium=email&utm_campaign=widget_showcase`).
- **From a real person.** "Built you a free river-conditions widget" from your name will out-open a branded no-reply sender for this kind of outreach.
- **Follow-up.** If no reply in ~5 days, a one-line nudge ("Did the river-conditions widget make sense for {{BusinessName}}? Happy to set it up for you.") tends to convert well.
- **CAN-SPAM.** Keep the opt-out line and a physical mailing address in the footer for cold sends.

---

## 7. Asset notes

- **Screenshots** (`public/email/`): `card.png` (Floatable From Here — branded for a demo "Riverside Retreat"), `live-conditions.png`, `planner.png` (a realistic ~9.8 mi / ~5 hr Current River float), `multi-river.png`, `eddy-quote.png`, `services.png`, `badge.png`. All captured at 2× for retina sharpness.
- **Demo card:** the "Floatable From Here" screenshot uses a real embed card created via the public API (`emb_324932fe`, Eminence MO → Jacks Fork). It's a throwaway demo — delete it whenever, or regenerate `card.png` branded for a real prospect.
- **Heads-up (product bug):** the **Gauge Report** widget's big headline number renders wrong — it showed `1 cfs` / `3 cfs` while the chart and "Eddy Says" line correctly read ~123 / ~1,010 cfs. That's why the Gauge Report isn't featured as a screenshot here (only mentioned in text). Worth fixing in the widget — the headline reading looks like it's pulling the wrong field or a rounded delta.
