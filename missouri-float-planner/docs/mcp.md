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
in the shared estimator. An explicit future date adds NWS NWPS outlooks for
linked route gauges; it does not calculate a future-condition float duration.
Outlooks use maximum local-day stage and compatible foot thresholds. Dates
outside the three-day window and unavailable/stale forecasts stay explicit.

`find_floats` considers at most six detailed downstream routes and returns at
most three. Selection first shortlists by river-mile duration, then ranks by
condition eligibility, duration fit and amenities. This is not an exhaustive
best-stretch search. Unknown conditions, critical alerts, incomplete alert
checks, critical recorded hazards and withheld durations prevent a positive
recommendation. Missing future forecasts yield conditional options only.

`get_services` includes recorded businesses and NPS campgrounds linked to
approved access points. `get_drive_estimate` requires explicit driving
coordinates and checks route plausibility. Neither confirms shuttle operation,
campsite availability, business hours or a booking.

## Operations

- Production requires `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`. Missing or failed shared limits return 503.
  Development uses the existing memory fallback.
- Every HTTP request counts toward 120/minute/IP. The three heavy tools
  (`plan_float`, `find_floats`, `get_drive_estimate`) additionally share
  12/minute/IP and 120/minute across the service. 429 includes `Retry-After`.
- POST bodies are bounded at 32 KiB. JSON-RPC batches are refused. Browser
  Origins must match the endpoint origin; nonbrowser clients may omit Origin.
- Public reads use the existing Supabase server client/RLS. No service-role
  bypass, database migrations, plan writes or booking writes are introduced.
- Source keys remain server-side: `OPENWEATHER_API_KEY`, `NPS_API_KEY`,
  `MAPBOX_ACCESS_TOKEN`. Missing/failed sources are reported, not silently
  treated as benign. NWS and USGS use existing public adapters.
- Existing `trackedMcp` aggregate counts/latency/error monitoring is preserved.
  See the telemetry runbook for its environment settings and retention.
  Optional `MCP_USAGE_LOGGING=true` logs tool, status, duration and a bounded
  client software name only. Stateless HTTP generally cannot retain
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
   local Supabase/source configuration. Inspect each tool and source status.
4. On a preview with working sources, ask: “Compare roughly three-hour canoe
   floats on the Current tomorrow.” Check sources, explicit forecast gaps,
   nearby outfitters and working plan links. A missing official forecast is a
   valid result; do not require an invented rating to pass the test.
5. Confirm bad/upstream endpoints are actionable tool errors. In development,
   121 `tools/list` requests within a minute must return 429 with Retry-After;
   the 13th heavy call must also return 429. Never load-test production to
   verify rate limits.
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
