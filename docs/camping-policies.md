# Camping policy and nightly observations

Booking policy answers whether reservations are required. A nightly observation
answers what the provider reported for a particular date. A seasonal closure
answers whether the site operates on that date. These are separate facts.

`missouri-float-planner/shared/camping-policy.ts` resolves these facts for the
server, web site details and iPhone site details. A verified, date-bounded
first-come policy can fill a missing nightly observation with "First come · No
reservations". It never promises an empty site, creates a reservable opening or
offers a booking button. A published seasonal closure takes precedence, including
over a contradictory daily walk-up code. Explicit booked/closed/unreleased
observations cannot be replaced by a first-come fallback.

Policies carry an official source, review date, expiration and exact covered
dates. The raw observation and its original timestamp remain separate. Cached
clients reapply both expirations; an expired policy cannot live on as an observed
fact. A single walk-up observation is not enough to create a durable policy.

## Reviewed rules

Rules live in `src/lib/camping/policies.ts` under the web app. Initial coverage is
deliberately limited to these verified Buffalo Point rules, reviewed November 11,
2026, keyed to Recreation.gov facility `234043` and the named loops/sites:

| Sites | Dates | Rule | Official source |
| --- | --- | --- | --- |
| Loops A and E | November 11–14, 2026 | Open, first come | [NPS Buffalo Point](https://www.nps.gov/buff/planyourvisit/buffalo-point-campground.htm) |
| Loops A and E | November 15, 2026–March 14, 2027 | Seasonally closed; first-come policy applies when operating | [NPS Buffalo Point](https://www.nps.gov/buff/planyourvisit/buffalo-point-campground.htm) |
| Loop B, B23–B41 excluding host site B38 | November 15, 2026–March 14, 2027 | Open, first come; winter services limited | [NPS camping](https://www.nps.gov/buff/planyourvisit/camping.htm) |

The Buffalo Point page inconsistently includes B in its general winter closure
list while explicitly saying B remains open. The park-wide camping page also
explicitly confirms B's winter first-come operation. No rule for other loops is
inferred from that inconsistent list. The park announces a reservation change
effective March 15, 2027, so this registry expires at that day's Central midnight.
Review the official sources before extending or adding rules. Other campgrounds
continue to rely on nightly observations until their policies are reviewed.

## Existing clients and release scope

The policy metadata on `/api/campsites` (both nightly and stay responses) is
additive. Individual-site reads retain the full site catalog so
missing sites can support "No confirmed openings" rather than a false
"nothing open". Unknown rows remain hidden by default on iPhone.

The iPhone app update is needed to preserve policy information when nightly
observations expire and to show the revised single-night empty state. Older
versions ignore the new metadata, may discard policy-only answers with no
observation timestamp, and retain their old incomplete-data wording.

Campground card/strip readers (`read.ts`, `stay-summary.ts`, `overview.ts`) and
their UI are outside this change. No availability record is removed because a
site policy or an individual-site stay summary is incomplete. The new web
Camping hub consumes this shared policy in its own reads and remains separately
flagged. No database migration or provider polling change is required.
