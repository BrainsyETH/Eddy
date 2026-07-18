// src/lib/email/reply-templates.ts
// Canned quick-reply templates for the admin inbox. Each is TipTap-compatible
// HTML loaded into the reply editor; [bracketed] bits are meant to be edited
// before sending. Kept dependency-free so the client composer can import it.

export interface ReplyTemplate {
  id: string;
  label: string;
  description: string;
  html: string;
}

const SIGNOFF = '<p>Happy floating,<br>Eddy · <a href="https://eddy.guide">eddy.guide</a></p>';

export const REPLY_TEMPLATES: ReplyTemplate[] = [
  {
    id: 'thanks',
    label: 'General thank-you',
    description: 'Friendly acknowledgment for any message',
    html:
      '<p>Hi [name],</p>' +
      '<p>Thanks for reaching out to Eddy — we really appreciate you taking the time to write in.</p>' +
      '<p>[Your reply here.]</p>' +
      SIGNOFF,
  },
  {
    id: 'data-correction',
    label: 'Data correction thanks',
    description: 'Someone reported an inaccuracy (gauge, access point, mileage)',
    html:
      '<p>Hi [name],</p>' +
      '<p>Thank you for flagging this — accurate river info is the whole point of Eddy, and reports like yours are how we keep it honest.</p>' +
      '<p>I’ve [logged / corrected] the [access point / gauge / mileage] you mentioned. [It’s live now / It’ll update on the next sync.]</p>' +
      '<p>If you spot anything else that looks off, just reply here.</p>' +
      SIGNOFF,
  },
  {
    id: 'outfitter-listing',
    label: 'Outfitter / business listing',
    description: 'An outfitter, campground, or shuttle wants to be listed or fix their listing',
    html:
      '<p>Hi [name],</p>' +
      '<p>Great to hear from [business name]! Eddy lists Missouri outfitters, campgrounds, and shuttle services for free, with click-to-call and a link straight to your booking page.</p>' +
      '<p>To get your listing set up (or corrected), could you confirm:</p>' +
      '<ul>' +
      '<li>Business name &amp; the river(s) you serve</li>' +
      '<li>Phone, website, and booking link</li>' +
      '<li>Services you offer (rentals, shuttle, camping, lodging)</li>' +
      '</ul>' +
      '<p>You can also embed Eddy’s free float-trip planner on your own site — happy to send details if that’s useful.</p>' +
      SIGNOFF,
  },
  {
    id: 'trip-planning',
    label: 'Trip planning help',
    description: 'A floater asking where/when to go or how long a float takes',
    html:
      '<p>Hi [name],</p>' +
      '<p>Happy to help you plan a float! The quickest way is Eddy’s planner — pick a put-in and take-out and you’ll see distance, float time, live gauge conditions, and a shuttle route:</p>' +
      '<p><a href="https://eddy.guide/plan">eddy.guide/plan</a></p>' +
      '<p>For your trip: [river / dates / group details]. Right now conditions there are [conditions]. [Recommendation.]</p>' +
      '<p>Let me know if you’d like a hand narrowing it down.</p>' +
      SIGNOFF,
  },
  {
    id: 'embed-widget',
    label: 'Embed / widget inquiry',
    description: 'A business asking about the embeddable planner or condition widgets',
    html:
      '<p>Hi [name],</p>' +
      '<p>Absolutely — Eddy’s widgets are free to embed and take about two minutes to install. You can add the full float-trip planner, a live conditions badge, or a multi-river overview, all carrying your branding.</p>' +
      '<p>Start here: <a href="https://eddy.guide/embed">eddy.guide/embed</a> — no account or API key needed.</p>' +
      '<p>If you tell me your site platform and which river(s) you run, I’ll send the exact snippet.</p>' +
      SIGNOFF,
  },
];
