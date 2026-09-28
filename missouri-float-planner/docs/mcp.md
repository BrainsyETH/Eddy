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

`find_floats` screens stored observations before choosing at most six detailed
routes and returning three compact options. Screening respects explicit reach
gauges and upstream/downstream fallbacks, batches latest readings, retains
unknown readings for full assessment, and excludes fresh unsuitable anchor or
in-span readings. The shortlist spreads work across reaches and put-ins, with
at most two pairs per put-in and a preference for less overlap. The shared
route estimator still makes the authoritative selection. SQL parity tests
execute the selection CTEs from the latest migration.

Search summaries retain endpoint links, gauge freshness, current duration
basis, requested-date outlooks and recommendation reasons. Shared alerts appear
once (eight notices, 300-character body excerpts, total count and truncation
flag). `detailRequired` means an agent must fetch `plan_float` before presenting
the option. Full plans retain weather, outfitters and complete hazard/alert
text. Search does not fetch weather or service enrichment. The representative
three-option fixture has a 12 KB serialized UTF-8 envelope budget; this is a
regression target, not a guarantee for every catalog. The safety note is
returned once in the enclosing envelope.

Route assessments have `blockingReasons`, `cautionReasons` and `notices`, with
stable codes and source IDs. Unknown/unsuitable water, independently severe
hazards and withheld durations prevent a positive recommendation. Missing
forecasts, failed/unconfigured alert checks and unresolved county/park warnings
remain conditional. Informational park notices and closures explicitly stating
that river access is unaffected can be notices without changing status;
ambiguous scope is not automatically downgraded. Source failures remain visible.

Explicit NPS closure statements naming the river, a selected endpoint, or the
entire park block the plan. The conservative text matcher recognises direct
closure statements only: qualified, partial or ambiguous scope stays
conditional. This is not a complete geospatial closure feed. `alerts.critical`
means a notice needs attention, not that it affects every route on the river.
An absent NPS park association is marked `not_applicable`; missing NWS search
terms are explicitly marked `matching_unconfigured`.

Hazard severities include the database's `danger` value. Unlocated lesser
hazards are cautions; unlocated danger cannot be excluded from the route.
Required portages are cautions (`portage_required`), including recorded side
and description. Availability and permission remain unverified. The portage
flag alone does not exclude a search result; an independent `danger` severity,
unsuitable water, closure or missing duration still can. Unknown hazard location
is preserved in the caution.

Uncalibrated gauges report `unknown`, while the independent flood-stage
threshold can still escalate danger. Missing calibration within the route
withholds its current duration. Empty searches report `excludedCandidates`,
`exclusionReasons` and `alertChecks` so agents can explain the outcome.
`screening` distinguishes eligible, floatable-rated, unsuitable and unknown
put-ins, plus screened-out pair counts. It covers recorded endpoints and stored
observations, not the whole river and not future conditions.

`get_services` includes recorded businesses and NPS campgrounds linked to
approved access points. `get_drive_estimate` requires explicit driving
coordinates and checks route plausibility. Neither confirms shuttle operation,
campsite availability, business hours or a booking.

## Operations

- Production requires `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`. Missing or failed shared limits return 503.
  Development uses the existing memory fallback.
- Every HTTP request counts toward 600/minute/IP, including rejected attempts.
  Heavy work shares a 60/minute/IP admission allowance and a 120/minute global
  ceiling. Within that ceiling, search and detailed planning/driving each have
  a separate 60/minute allocation. Search cannot consume the detail allocation
  or vice versa. Each class is capped at half the configured global ceiling;
  unused capacity is deliberately not borrowed across classes.
  `MCP_REQUESTS_PER_IP_PER_MINUTE`, `MCP_HEAVY_PER_IP_PER_MINUTE`,
  `MCP_HEAVY_GLOBAL_PER_MINUTE` (minimum 2), `MCP_SEARCH_GLOBAL_PER_MINUTE` and
  `MCP_DETAIL_GLOBAL_PER_MINUTE` configure the initial allowances. These are
  cost controls, not measured capacity guarantees or per-user fairness: shared
  connector egress and callers using multiple IPs remain indistinguishable.
  Heavy admission checks all three buckets in one Redis EVAL operation and
  increments only if all allow the call. Rejected work does not consume an IP,
  class or global work allowance. The general HTTP attempt limit still counts
  it. Upstash must permit EVAL/GET/INCR/PTTL/PEXPIRE; errors fail closed with 503.
  One search admission covers at most six estimates/two concurrent workers.
  429 includes Retry-After and logs the rejecting bucket. Redis failure logs
  from the work-admission adapter contain no URLs, credentials or raw IP keys.
- Explicit plans and drive estimates have a 25-second overall execution budget.
  For plans, external alert/outlook/weather reads stop at 20 seconds, leaving
  time to return the assessed route with explicit missing-source statuses.
  Missing future outlooks remain conditional; completed closure/hazard blockers
  remain blocking. A completed plan and finished enrichment are retained when
  another add-on reaches the deadline. If core route work is unfinished, return
  unavailable with deadlineReached and a retry message, never a fabricated time.
  OpenWeather and Mapbox accept cancellation signals as optional arguments;
  existing non-MCP callers retain their existing 10-second timeout behavior.
- Search has a 20-second execution budget, including screening and alert
  checks. Two workers stop scheduling when it expires; the signal cancels
  PostgREST/NPS/NWS/USGS HTTP requests. Pending network waits are also released.
  Cancellation does not guarantee that a remote database has stopped all
  already-started server-side work. Live USGS fallbacks have a three-second
  budget and do not start a legacy fallback after cancellation.
  `deadlineReached`, `attempted`, `evaluated`, `timedOutCandidates` and
  `notEvaluatedCandidates` distinguish partial work from unsuitable routes.
  A deadline with zero completed plans is still `partial`, not an all-clear
  or a whole-river rejection. Platform startup/network overhead is outside
  the executor budget. NPS/NWS already use 15-minute fetch revalidation.
- POST bodies are bounded at 32 KiB. JSON-RPC batches are refused. Browser
  Origins must match the endpoint origin; nonbrowser clients may omit Origin.
  Stateless JSON transport supports POST only. GET and DELETE return 405 with
  Allow: POST; an empty SSE stream would cause needless SDK reconnections.
  Malformed JSON returns -32700; invalid request shapes return -32600.
  Oversized requests retain HTTP 413.
- Public reads use the existing Supabase server client/RLS. No service-role
  bypass, database migrations, plan writes or booking writes are introduced.
- Source keys remain server-side: `OPENWEATHER_API_KEY`, `NPS_API_KEY`,
  `MAPBOX_ACCESS_TOKEN`. Missing/failed sources are reported, not silently
  treated as benign. NWS and USGS use existing public adapters.
- Existing `trackedMcp` aggregate counts/latency/error monitoring is preserved.
  See the telemetry runbook for its environment settings and retention.
  Optional `MCP_USAGE_LOGGING=true` logs tool, status, duration and a bounded
  client software name, an unverified coarse User-Agent family hint, and search
  phase timings (coverage, catalog, screening, alerts, estimates). No raw
  User-Agent is logged. Neither the hint nor a shared network bucket can
  establish caller identity or join calls into an individual conversation.
  Rejections are logged separately, even with optional
  usage logging off, with status, retry delay, rejecting bucket and heavy tool
  name when available. Logs use a daily HMAC network-bucket ID, never raw IPs;
  Only a dedicated `MCP_LOG_HASH_KEY` supplies the correlation key; the Redis
  token is never reused. Redis token rotation does not change the log buckets.
  Without a key the correlation field is omitted. Optional call logs use the same ID.
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
   working plan links, then call `plan_float` for full weather and outfitters. A missing official forecast is a
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


### Model and preview evaluation

`scripts/mcp-eval.ts` reads 20 shared prompts from `scripts/mcp-eval-cases.json` covering searches, explicit plans,
reversed endpoints, drive-only requests, services, weather, alerts, gauges,
unsupported rivers, future dates, portages and safety claims. It connects with
the real MCP SDK, lists server tools/instructions, and runs a bounded tool loop
through either Anthropic Messages or OpenAI Responses. No model is selected by
default. The same harness can reach localhost or use a protected preview’s
`VERCEL_AUTOMATION_BYPASS_SECRET` header. Credentials are never included in
reported endpoint URLs. It does not change deployment protection.

```sh
npm run mcp:eval -- --check
# MCP_EVAL_URL=https://<preview>/api/mcp
npm run mcp:eval -- --smoke
# Also set MCP_EVAL_PROVIDER=anthropic or openai, MCP_EVAL_MODEL,
# and ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment.
# Optional MCP_EVAL_CASE=current-canoe; MCP_EVAL_OUTPUT defaults to /tmp.
npm run mcp:eval
```

`--smoke` also checks Akers Ferry → Pulltite. Set `MCP_EVAL_DATE` to replay
all four probes for a requested date. Both evaluation modes below use the
same case IDs, expected tools and human-review rubrics.

For the hosted MCP connector path, use `npm run mcp:eval:hosted -- --list`
without credentials. A model run requires `MCP_EVAL_URL`, `MCP_EVAL_MODEL`
and `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`:

```sh
npm run mcp:eval:hosted -- --provider anthropic --limit 1
npm run mcp:eval:hosted -- --provider openai --case current-canoe
```

Use a remotely reachable HTTPS MCP endpoint, not localhost. The hosted harness
**ignores VERCEL_AUTOMATION_BYPASS_SECRET**. It rejects credentials/query strings
in MCP_EVAL_URL. Prefer the local SDK evaluator for a protected preview: it sends
its bypass header directly to Vercel, not to the model provider.

If hosted evaluation must access a protected endpoint, create a dedicated Vercel
secret named for this evaluation and pass it as MCP_EVAL_BYPASS_SECRET together
with --allow-provider-bypass. Both are required; setting the variable alone
fails before any provider request. This explicitly sends a credential-bearing
URL to the selected model provider. Local report redaction does not control
provider-side handling or retention. A Vercel bypass secret covers deployments
across its project; it is not scoped just to MCP. Revoke this dedicated token
after testing. Do not rotate a shared CI token or remove protection from the
whole app to run this test. An isolated public MCP-only test deployment is
another option when deliberately configured for that purpose.

Keep secret-bearing URLs out of registry metadata. --out selects the report.
This path tests API-hosted MCP calls, while mcp:eval controls the client locally;
neither replaces testing the Claude/ChatGPT application connector UI. Both
record tool sequences, counts, latency, token usage, outputs and final answers.
The hosted report records completion status; truncated replies need review.

Both reports include detailFollowups: for each abbreviated search option, check
for a later completed plan_float response with the same endpoints, vessel and
requested date. A call for another route, a failed call or a call before the
search does not qualify. unconfirmedPresentedOptions flags an option named or
linked in the answer without that follow-up. Prose-only/ambiguous selection and
warning preservation still require human review. An unselected option need not
be expanded. The case rubrics explicitly include this check.

The report records tool sequence, arguments/results, latency, response bytes,
provider token usage and final answer for these synthetic prompts. Link,
expected-tool and caveat-language checks are heuristics, not automatic semantic
approval; review the case-specific rubric and original tool results. Compare
reports before consolidating tools. These API evaluations do not establish
Claude/ChatGPT application connector compatibility: replay in both actual
hosts before promotion. Hosted API MCP connectors need a reachable remote
URL; the SDK-driven harness can use a local server without a public tunnel.

For deployed verification, configure NPS, OpenWeather, Mapbox and Upstash in
the preview and measure cold/warm phase timings there. The automation bypass
header is supported by Vercel. Its query-parameter alternative is a secret-bearing
URL and must not be published; host-specific preservation requires testing.
A successful preview build or SDK smoke is not a completed model/host evaluation.

References:
- https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal
- https://developers.openai.com/api/docs/guides/function-calling
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation


### Search follow-up replay (2026-09-27 UTC)

Public-RLS/live-NWS local HTTP replay confirmed the new summary schema and
cancellation behavior. No production writes were performed. Timings varied
substantially across local proxy/database calls and are not deployed benchmarks:

- The first Buffalo run completed six assessments and returned three options
  in 12.1 seconds, with an 8.5 KB envelope (previous full data was about 22.5 KB).
- After removing serial catalog/screening waits and reusing station metadata,
  Current returned one completed conditional option at the 20-second deadline,
  with explicit outstanding/not-evaluated counts and a 4.7 KB envelope.
- Jacks Fork screened out 54 of 55 downstream pairs, then assessed the remaining
  pair. Its requested-day forecast was unsuitable; the 3.8-second response
  distinguished those findings from a whole-river claim.
- A later Buffalo request reached the deadline without a completed assessment;
  it returned `partial` and did not mislabel the river unsuitable.
- Akers Ferry → Pulltite still returned the Akers gauge, good current conditions,
  a full plan and a current-based duration, conditional on checking NPS notices.

These runs verify honest bounded behavior, not acceptable production latency
under load. The remaining release check is a configured Vercel preview with
cold/warm phase timings, followed by real model and application-connector
replays. NPS/OpenWeather keys, model API keys and a preview bypass credential
were unavailable in this workspace; no successful live test of those paths is
claimed. The evaluation readiness command lists 20 cases without making calls.

A read-only portage impact query found affected endpoint pairs on nine active
rivers. Required-portage flags alone now produce cautions; those counts do not
imply every pair qualifies after water, duration, closure and severe-hazard checks.

The query counted 13 active required-portage hazards intersecting 482 distinct
downstream pairs of approved float endpoints, including private endpoints.
Independent public-only, water, duration and severe-hazard checks still apply.
Screening-gauge selection matched the production database resolver at all 66
checked approved float endpoints on Current, Jacks Fork and Buffalo. Offline
tests additionally execute the latest migration's mile-selection CTEs, including
explicit reach overrides and inactive stations.

After reconciling the final changes, all 2,848 registered tests and the 15-test
pretest passed on Node 20, as did both type checks. The standard check command
still hit the workspace's `tsx` socket restriction; the same tests and token
check passed via `node --import tsx`. The dated HTTP SDK replay returned three
Current options (9.3 KB, five completed assessments), an explained empty Jacks
Fork result (one assessed pair), and an explicit partial Buffalo result with
no completed assessment when its deadline expired. Akers–Pulltite retained
gauge 07064533 and its good rating. Local network latency varied substantially;
no production performance or model-evaluation success is inferred from this.

Screening advances through ordered in-span gauges once per put-in instead of
rescanning every gauge for every endpoint pair. Its coverage count excludes
duplicate-mile endpoints with no strictly downstream take-out. Summary truncation
of any reason, notice or warning sets `detailRequired`; alert title truncation
also marks the alert collection incomplete. HTTP abort stops client requests
and new scheduling, but does not guarantee cancellation of statements already
received by a database server.

The v2 search contract now contains compact `recommendations[].data`, not full
plan payloads. Consumers of the earlier PR preview must use `plan_float` to get
complete details and honor `detailRequired` on abbreviated search entries.


### Shared planner impact and review boundary

The shared estimator changes are not MCP-only. Flood-stage escalation and
suspect-reading handling for in-route gauges can change conditions shown by
/api/plan, /api/route-estimate, access-point detail estimates, and social plan
context. Missing rivers/vessels return 404; database failures return 500.
Typical-condition favorite-float estimates share lookup/error changes but skip
live span checks. MCP additionally consumes the new anchorCondition,
contributingGauges and spanCheckComplete fields. Existing web consumers do not
automatically inherit MCP's conditional/recommendation wrapper.

Review the shared estimator, its fixture and regression tests as a prerequisite
change. MCP depends on those returned fields; rolling back the estimator alone
while retaining this MCP version is unsupported. After the prerequisite merges,
retarget the MCP PR to main. Weather/Mapbox optional cancellation arguments stay
with the MCP cleanup because that is their caller; old callers are unchanged.

The legacy-to-v2 envelope and compact-search result are breaking client changes.
Notify any known preview consumers before production release and point them to
the migration notes above. A version bump does not migrate a client's parser.

### Audit cleanup validation (2026-09-28 UTC)

The shared estimator and its regression coverage are isolated in prerequisite
PR #1352. Review and merge that PR into main first, then retarget MCP PR #1343
to main before merging it. Do not merge the MCP PR into the prerequisite branch.

After resolving the test-script conflict and retaining both registrations, all
2,908 registered tests and 15 pretests passed on Node 20. Both type checks and
the Tailwind token check passed; full ESLint reported zero errors and the 14
existing unrelated warnings. The evaluation scripts and helpers passed their
explicit lint check with zero warnings. The same `tsx` socket restriction
required `node --import tsx` for the token checker and tests.

Regression coverage includes heavy-tool deadlines and retained partial plans,
actual weather/driving cancellation, atomic heavy-work admission, class capacity
reservation, rejected-work accounting, malformed JSON, omitted unconfigured log
IDs, gauge overflow, hosted-token opt-in, and matching required plan follow-ups.
The admission Lua also passed local Redis-emulator checks; this is not a hosted
Upstash integration test. Both evaluation readiness commands list all 20 cases.

No new configured preview, paid-model or application-connector run was possible
without credentials. Existing local replay timings above remain historical;
this cleanup does not establish production latency or capacity.
