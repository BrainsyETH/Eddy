# Admin dashboard: interpretation and investigation

Reviewed September 26, 2026 against the merged visual overview (PR #1341).
The feedback describing 120 equal-weight visible cards applies to the earlier
metric inventory. The overview already has period comparisons, service cards,
a timeline, and collapsed Diagnostics. The remaining interaction gaps were real.

## Research and practical implications

- [Metabase dashboard interactivity](https://www.metabase.com/docs/latest/dashboards/interactive): charts can drill into data, apply filters, or navigate to a purposeful destination. Eddy's numbers should open a relevant detail view instead of sending every click to a generic diagnostics section.
- [Grafana dashboard best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/): answer a question, reduce cognitive load, document panels, link levels of detail, and avoid needless refreshes. Eddy should preserve units, periods and collection limitations alongside an actionable number.
- [Grafana data links](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/configure-data-links/): data links can retain the selected context. Widget drilldowns therefore retain the selected period/source when a domain is selected.
- [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): defer secondary complexity while retaining frequently needed information. Essential definitions stay visible; long explanations move into details rather than hover-only tooltips.
- [Heuristics for Supporting Cooperative Dashboard Design](https://arxiv.org/abs/2308.04514), Setlur et al. (2023): dashboards should support an analytical conversation. The evaluation involved 52 graduate students, not an Eddy operator study; it supports the approach, not a guarantee of usability here.
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): retain keyboard focus inside a modal, support Escape and restore focus on close. The native dialog supplies modal behavior; the implementation labels it and restores the triggering control.

These are design guidance and product patterns, not proof every metric needs a
chart or a destination page. A useful explanatory panel is better than a link
that suggests a filter the destination does not actually support.

## Implemented in this follow-up

- Accounts, saved plans and subscribers open their definitions and matching
  breakdowns. Growth details preserve the overview's selected 7/30-day window.
- Combined inbox, content opportunities, river bars, service details, attention
  items and every diagnostic metric have an exploration action.
- Job attention opens that job's recorded runs, not just the timeline section.
  Diagnostic jobs use one compact table; recent-run labels are relative.
- Provider explanations define calls, errors and p95 and preserve coverage notes.
  Configured, unmeasured and unavailable remain distinct; configuration does not
  prove health.
- Widget reach leads with **externally referred widget loads**, separately
  reporting Eddy/known previews and unknown referrers. The detail panel provides
  7/30 UTC-day filters, day counts, referring domains, widget types and river/widget
  keys. Domain selection refilters all breakdowns. Today is partial, unlike the
  growth charts' complete-day comparisons, and this difference is explicit.
- Referrer is not embed-host verification. Facebook can refer someone to a
  standalone widget; repeated loads and gallery previews count. These counters
  do not measure unique people, clicks, completed trips, or conversions.
- No arbitrary site URLs are made into executable links. Untrusted host strings
  remain React-escaped labels and filter values.

The new widget read is bounded to 30 days / 2,000 existing daily counter rows,
with explicit truncation/error handling, under the same 180-second cache. No new
tracking writes, provider calls, database migration, or analytics service.

## Feedback alignment and outstanding work

| Feedback | Assessment / next step |
|---|---|
| Too many equal cards | Main overview already addressed this. This follow-up compacts diagnostic jobs and moves longer metric explanations into drilldowns. |
| Five-second health summary | Existing top strip covers river freshness and review count only. A broader area summary should be based on explicit health/coverage policies; do not call the whole system “All clear” with unchecked dependencies. |
| Severity and thresholds | Agree. Inventory count >0 is not a universal incident policy. Define severity, time windows, denominators, suppression and recovery per signal. The existing login metric is 24 hours, so “5 per hour” cannot be implemented from it. No arbitrary thresholds are silently introduced here. |
| Pending push = critical failure | Pushback: pending/cleared states cannot establish whether a notification reached a phone. Prioritize backlog/retry exhaustion but describe exactly what is known. |
| Business and usage trends | Account/plan comparisons already exist. Subscriber snapshots and historical incident onset are still missing. A daily count does not reveal when each individual issue began. |
| Daily digest and state-change alerts | High-value next operational step. Reuse the summary, but add persistent incident identity/state, deduplication, recovery rules, quiet hours and recipient/channel configuration. No messages are sent by this change. |
| Link every metric | Implemented meaningful details for all diagnostic metrics and overview KPIs. Existing admin destinations are available within details. Destination filters must be verified before passing query parameters; the missing-photo editor currently opens unfiltered. |
| Not configured vs broken | Keep these distinct. Reporting access may be unconfigured while the provider itself works. Unknown does not necessarily establish an outage either; it can mean unavailable history or an exceeded read cap. |
| Human timestamps | Already displayed Central time; this follow-up adds relative last-run labels and the compact jobs table. Raw schedule diagnostics remain secondary. |
| External uptime | Still needed. Use a narrowly scoped authenticated readiness endpoint with a bounded DB probe and a read-only monitor credential. The external monitor must run outside Eddy to detect full-site outages. |
| Releases | Still needed. Integrate deployment/CI/build metadata via scoped read access or event ingestion; distinguish latest attempted, latest successful and currently deployed releases. No such data is inferred from configuration. |

Suggested next operational milestone: incident state + digest/new-incident
notifications, plus external uptime monitoring. Daily snapshots and release
metadata can then enrich that same report. Delivery requires the operator's
chosen recipient/channel and explicitly authorized credentials/configuration.

## Verification

Both TypeScript projects and Tailwind token checks pass; all 2,799 web tests
pass through the Node tsx loader (the environment's tsx CLI IPC limitation is
unchanged). ESLint passes on the changed dashboard files. Widget tests cover
period boundaries, future-row exclusion, first-party suffix matching, unknown
referrers, total reconciliation and domain/source filtering. Actual Next API
requests against a fixture database verify the new read, auth-before-queries,
cache reuse and no credential/account-ID exposure. Browser checks cover KPI,
widget, inbox, river, service and diagnostic click paths, period/source/domain
filters, Escape, focus restoration, modal focus containment, mobile overflow
and unavailable history. Desktop and mobile renders were visually reviewed.
A read-only production count confirmed 358 daily-counter rows in the 30-day
window, below the 2,000-row limit. No production configuration or data changed.
