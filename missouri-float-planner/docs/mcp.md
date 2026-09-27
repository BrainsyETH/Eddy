# Eddy’s public MCP

The remote endpoint is `https://eddy.guide/api/mcp` (Streamable HTTP).
The connection guide is `/developers`; authoritative curated coverage is
`list_rivers` and `/coverage`. Eddy’s own chat route remains disabled.

## Interface and compatibility

`src/lib/agent-tools/catalog.ts` defines the shared MCP/chat inputs and output
envelopes. The executor and source/planning modules are transport independent;
they call shared domain helpers, not Eddy’s HTTP endpoints. Chat retains its
private report and web-search tools separately.

The server version comes from `server.json`, independent of the website’s
package version. Version 2 changes tool results from legacy flat objects to
`{status, data, warnings, safetyNote}`. Existing tool names remain, and
`plan_float` still accepts `riverId`, `startAccessPointId` and
`endAccessPointId`; new clients should use river/launch slugs and `vesselType`.
Clients consuming the old result shape need to migrate before release.

Statuses distinguish successful data, recorded absence, partial coverage,
unavailable data, lookup failures and invalid requests. Live components own
source/timestamp fields: an aggregate plan has no single observation time.
Missing observation/issue times stay null. Retrieval time is not observation
time. Recorded hazards and service directories have no freshness claim.

The put-in gauge reading is preserved separately from the route assessment.
A downstream gauge may escalate the route; missing, suspect or stale coverage
withholds current float times from agents. Regulated-water withholding remains
in the shared estimator. MCP reads the existing public USGS daily-statistics
snapshots for optional historical flow adjustments, avoiding slow live and
legacy statistics calls inside a bounded search. `historicalFlowReference`
reports the available median; a missing snapshot uses the estimator's existing
condition-band speeds or published segment time, never an invented median.
An explicit future date adds NWS NWPS outlooks for
linked route gauges; it does not calculate a future-condition float duration.
Outlooks use maximum local-day stage and compatible foot thresholds. Dates
outside the three-day window and unavailable/stale forecasts stay explicit.

`find_floats` considers at most six detailed downstream routes and returns at
most three. Selection first shortlists by river-mile duration, then ranks by
condition eligibility, duration fit and amenities. This is not an exhaustive
best-stretch search. Each route assessment has `blockingReasons` and
`cautionReasons` with stable codes, messages and source IDs where applicable.
Unknown/unsuitable water, critical recorded hazards and withheld durations
prevent a positive recommendation. Missing forecasts, failed/unconfigured
alert lookups, county weather warnings and ambiguous park notices yield
conditional options with explicit verification requirements. Source failures
remain failures in `alerts.sources`; they never become an all-clear.

Explicit NPS closure statements naming the river, a selected endpoint, or the
entire park block the plan. The conservative text matcher recognises direct
closure statements only: qualified, partial or ambiguous scope stays
conditional. This is not a complete geospatial closure feed. `alerts.critical`
means a notice needs attention, not that it affects every route on the river.
An absent NPS park association is marked `not_applicable`; missing NWS search
terms are explicitly marked `matching_unconfigured`.

Hazard severities include the database's `danger` value. Unlocated lesser
hazards are cautions; unlocated danger cannot be excluded from the route.
Required portages remain blocked with `portage_unverified`: a portage flag or
bank side alone does not verify a usable, permitted bypass. A future curated
bypass record can support conditional portage recommendations.

Uncalibrated gauges report `unknown`, while the independent flood-stage
threshold can still escalate danger. Missing calibration within the route
withholds its current duration. Empty searches report `excludedCandidates`,
`exclusionReasons` and `alertChecks` so agents can explain the outcome.

`get_services` includes recorded businesses and NPS campgrounds linked to
approved access points. `get_drive_estimate` requires explicit driving
coordinates and checks route plausibility. Neither confirms shuttle operation,
campsite availability, business hours or a booking.

## Operations

- Production requires `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`. Missing or failed shared limits return 503.
  Development uses the existing memory fallback.
- Every HTTP request counts toward 600/minute/IP. The three heavy tools
  (`plan_float`, `find_floats`, `get_drive_estimate`) additionally share
  60/minute/IP and 120/minute across the service. One `find_floats` call counts
  once; its internal six-estimate/two-at-a-time bounds still apply.
  Configure `MCP_REQUESTS_PER_IP_PER_MINUTE`, `MCP_HEAVY_PER_IP_PER_MINUTE`, and
  `MCP_HEAVY_GLOBAL_PER_MINUTE` with positive integer allowances. These are
  initial operational budgets, not measured capacity guarantees. Keep a
  per-IP abuse allowance alongside the global budget; shared connector egress
  cannot identify individual users. Tune from 429s, upstream cost and latency.
  429 includes `Retry-After`; 503 means shared admission could not be checked.
- POST bodies are bounded at 32 KiB. JSON-RPC batches are refused. Browser
  Origins must match the endpoint origin; nonbrowser clients may omit Origin.
  Stateless JSON transport supports POST only. GET and DELETE return 405 with
  Allow: POST; an empty SSE stream would cause needless SDK reconnections.
- Public reads use the existing Supabase server client/RLS. No service-role
  bypass, database migrations, plan writes or booking writes are introduced.
- Source keys remain server-side: `OPENWEATHER_API_KEY`, `NPS_API_KEY`,
  `MAPBOX_ACCESS_TOKEN`. Missing/failed sources are reported, not silently
  treated as benign. NWS and USGS use existing public adapters.
- Existing `trackedMcp` aggregate counts/latency/error monitoring is preserved.
  See the telemetry runbook for its environment settings and retention.
  Optional `MCP_USAGE_LOGGING=true` logs tool, status, duration and a bounded
  client software name. Rejections are logged separately, even with optional
  usage logging off, with status, retry delay, rejecting bucket and heavy tool
  name when available. Logs use a daily HMAC network-bucket ID, never raw IPs;
  `MCP_LOG_HASH_KEY` or the existing Upstash token supplies the server-only key.
  Without a key the ID is `unavailable`. Optional call logs use the same ID.
  Apply the hosting log retention policy to these diagnostics.
  Stateless HTTP generally cannot retain
  initialize-time clientInfo across requests; `not_reported` is expected.
  These metrics do **not** identify unique users or repeat integrations.
- MCP is free. Existing deployment-dependent x402 REST policy is separate;
  `llms.txt`/`llms-full.txt` report its configured state.

## Validation and release

1. `make check-web` under the pinned Node version.
2. Offline MCP tests in `src/lib/agent-tools/agent-tools.test.ts` use the real
   SDK’s paired in-memory transports. They cover negotiation, all tools,
   schemas/annotations, attribution, stale/suspect data, failed sources,
   future outlooks, date/unit errors, limits, bounded search and read reuse.
3. Run `npm run dev`, then connect the MCP Inspector to
   `http://localhost:3000/api/mcp` using Streamable HTTP. Tools need the normal
   local Supabase/source configuration. Use the Inspector's server-side
   connection (proxy in Inspector v1), or its CLI, rather than direct browser
   requests from the Inspector UI origin. A cross-origin browser connection
   correctly gets 403; do not disable Origin validation for testing. Pin and
   record the Inspector version used, because its UI/CLI options change.
   Inspect each tool and source status.
4. On a preview with working sources, replay Current, Jacks Fork and Buffalo
   (Arkansas). Ask: “Compare roughly three-hour canoe
   floats on the Current tomorrow.” Check sources, explicit forecast gaps,
   nearby outfitters and working plan links. A missing official forecast is a
   valid result; do not require an invented rating to pass the test.
5. Confirm bad/upstream endpoints are actionable tool errors. In development,
   temporarily set small local allowances (for example 2 general and 1 heavy)
   and verify 429 plus Retry-After on the next request. Test the IP and global
   buckets separately and check rejection logs. Never load-test production.
6. Review and deploy before submitting listings. Verify the deployed version,
   developer page, privacy/terms links and all source statuses first.

## Discovery package

`server.json` is prepared metadata for the official MCP Registry, **not a
published listing**. It describes a hosted remote; no npm package is needed.
The `io.github.BrainsyETH/` namespace requires the matching GitHub identity.
After deployment and approval to publish, use the official publisher:

```sh
cd missouri-float-planner
mcp-publisher login github
mcp-publisher publish
```

Verify the result in the Registry, then use `/developers` and the remote URL
for directory submissions and integration outreach. A registry listing does
not automatically install Eddy in anyone’s assistant. Directory review and
host-specific requirements are separate; no listing approval is implied by
read-only annotations or the choice to offer unauthenticated public access.

Primary setup references (checked 2026-09-26):
- https://modelcontextprotocol.io/registry/remote-servers
- https://modelcontextprotocol.io/registry/quickstart
- https://code.claude.com/docs/en/mcp


## Version 2 release notes

This release changes the response contract. A v1 consumer reading fields from
`result` must read the tool-specific fields from `result.data` and inspect
`result.status` and `result.warnings`. For MCP SDK callers, use
`response.structuredContent`; the JSON text content mirrors that envelope.
Legacy tool names and planning UUID arguments remain supported. Do not infer
that there are no existing consumers from missing client identity telemetry.

Recommendation statuses now distinguish `candidate`, `conditional`, and
`not_recommended`; surface the blocking/caution reasons. A conditional route
requires the checks stated in its reasons and is never a promise of safety.

### Review replay (2026-09-27 UTC; requested trip date 2026-09-27 Central)

Ran the real SDK against the local HTTP MCP route with the production
publishable key/public RLS and live NWS feeds. No database writes or privileged
credentials were used. All 13 tools negotiated; the standalone GET returned
405 once without the previous repeated stream reconnections.

- Current: six evaluated, three conditional options returned.
- Jacks Fork: six evaluated, none returned because current water and the
  requested-day outlook were too low. Exclusion reasons were explicit.
- Buffalo (Arkansas): six evaluated, three conditional options returned.
- Akers Ferry → Pulltite: Akers gauge 07064533, rated good, complete span check,
  duration and planner link returned; conditional on checking official notices.

NPS and OpenWeather keys were absent locally. Their success paths were covered
by offline tests, while the live replay explicitly reported their missing
coverage. Current's search dropped from approximately 61 seconds to 29 seconds
when optional historical statistics used the existing public snapshots;
Jacks Fork and Buffalo took approximately 10 and 21 seconds. These are local
smoke timings, not production capacity measurements. Configured-source preview
verification and operational tuning still apply before public promotion.
