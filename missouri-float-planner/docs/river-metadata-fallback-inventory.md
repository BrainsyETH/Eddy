# River metadata fallback inventory

The canonical database is now the only production source for this metadata.
The hourly `river_metadata` Trust check covers every active `rivers` row and
opens a per-river finding for any missing required value.

| Removed fallback | Production callers | Canonical database source | Missing-data behavior |
| --- | --- | --- | --- |
| `src/data/river-sections.ts` (`RIVER_SECTIONS`) | Eddy update cron through `src/lib/eddy/update-targets.ts`; `generate-update.ts` consumes its target type | Active rows in `rivers`; optional reaches in `river_sections` (`section_slug`, `name`, `description`, `river_type`, `low_water_meaning`, `rising_water_hazards`) | A failed canonical query throws and fails the monitored generation pass. Zero reach rows is valid and still creates a whole-river target. |
| `src/lib/nws/alerts.ts` (`LEGACY_RIVER_SEARCH_TERMS`) | Eddy update generation, chat weather tool, alert fanout in `src/lib/alerts/river-alerts.ts` | `rivers.alert_search_terms` | **Fails open**: logs `[NWS]` and returns the UNFILTERED state feed, and Trust opens `canonical_alert_terms_missing`. See the note below. |
| `src/lib/weather/openweather.ts` (`LEGACY_RIVER_CITY_MAP`) | Eddy update and gauge-update generation, chat weather tool, river outlook API, weather and forecast APIs | `rivers.weather_city`, `weather_lat`, `weather_lon` | Logs `[Weather]` and returns `null`; Trust opens `canonical_weather_missing`. |
| `src/lib/eddy/rain-lag.ts` (`RAIN_LAG`) | `src/lib/eddy/generate-update.ts` prompt construction | `river_characteristics.rain_lag_hours`, `rain_lag_note`, `drop_rate_note` joined by `river_id` | Logs `[EddyGen]`, omits rain-lag guidance, and Trust opens `canonical_rain_lag_missing`. |
| `src/data/eddy-quotes.ts` (`RIVER_NOTES`) | Eddy generation plus river cards, report quote, and embed static-copy paths | `river_characteristics.river_note` joined by `river_id` | Server generation reads the canonical note. Client static copy carries no note at all — see below. |

## Coverage at the time of removal

Measured against the 24 active rivers, not assumed:

| Canonical field | Active rivers missing it |
| --- | --- |
| `rivers.alert_search_terms` | 0 |
| `rivers.weather_*` | 2 (`kings-river`, `spring-river-mo`) |
| `river_characteristics.rain_lag_*` | 15 |
| `river_characteristics.river_note` | 2 (`kings-river`, `spring-river-mo`) |

The removed code maps were narrower than the table in every case — they covered
eight or nine rivers each, from before the expansion into Arkansas — so for most
of these rows the "fallback" had already been absent for months. The one live
exception was `gasconade`, whose rain-lag values existed only in `RAIN_LAG`;
migration `20260822120000_gasconade_rain_lag_canonical.sql` carries them into
the table so deleting the map removes nothing that was being served.

The fourteen remaining rain-lag gaps are pre-existing and now visible. That is
the point of the check: they were always missing, and until now nothing said so.

## Why the alert filter still fails open

`filterAlertsForRiver` keeps returning the unfiltered state feed when a river
has no canonical terms. Both of its callers are prompt builders
(`generate-update.ts`, `chat/tool-handlers.ts`), and the screen path guards
itself: `matchWeatherAlerts` skips untermed rivers at its own boundary so a
newly ingested creek cannot show every flood warning in the state as its own.
That guard was deliberately placed at the call site rather than in the shared
helper — `src/lib/alerts/river-alerts.ts` says so in as many words — so
tightening the helper would both break the contract it names and make its
comment false. `canonical_alert_terms_missing` is filed `high`.

## Why client static copy carries no note

`RiverCard`, `EddyQuote` and the embed page reach their static-copy branch
precisely when `/api/eddy-update` returned nothing, so there is no response to
carry a canonical note on. Rather than keep a hardcoded map alive for that
branch, the note is dropped from it: the `{note}` placeholder is gone from the
quote templates and the conditional layout that used to accommodate it is gone
with it. Restoring local color there means adding a river-note field to the
"unavailable" response shape — a deliberate API change, not a fallback.

`buildStaticEddyText` keeps its `riverNote` parameter: the input is legitimate
and the server-rendered report path can supply it. Only the card cannot.

## Severity and remediation

All four rules are registered in `src/lib/trust/severity.ts`
(`RIVER_METADATA_RULES`) and `src/lib/trust/remediation.ts`. All four are
`judgment`, not `mechanical` — no script knows which town is the right weather
proxy for a river or how fast it drops, which is why the hardcoded maps lasted
as long as they did.

No resilience fallback is retained, so there is no deferred deletion criterion.
Database outages remain observable through existing context/query errors rather
than being disguised as valid static metadata.
