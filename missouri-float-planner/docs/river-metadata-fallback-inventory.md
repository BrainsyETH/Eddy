# River metadata fallback inventory

The canonical database is now the only production source for this metadata.
The hourly `river_metadata` Trust check covers every active `rivers` row and
opens a per-river finding for any missing required value.

| Removed fallback | Production callers | Canonical database source | Missing-data behavior |
| --- | --- | --- | --- |
| `src/data/river-sections.ts` (`RIVER_SECTIONS`) | Eddy update cron through `src/lib/eddy/update-targets.ts`; `generate-update.ts` consumes its target type | Active rows in `rivers`; optional reaches in `river_sections` (`section_slug`, `name`, `description`, `river_type`, `low_water_meaning`, `rising_water_hazards`) | A failed canonical query throws and fails the monitored generation pass. Zero reach rows is valid and still creates a whole-river target. |
| `src/lib/nws/alerts.ts` (`LEGACY_RIVER_SEARCH_TERMS`) | Eddy update generation, chat weather tool, alert fanout in `src/lib/alerts/river-alerts.ts` | `rivers.alert_search_terms` | Logs `[NWS]` and returns no river-matched alerts; Trust opens `canonical_alert_terms_missing`. |
| `src/lib/weather/openweather.ts` (`LEGACY_RIVER_CITY_MAP`) | Eddy update and gauge-update generation, chat weather tool, river outlook API, weather and forecast APIs | `rivers.weather_city`, `weather_lat`, `weather_lon` | Logs `[Weather]` and returns `null`; Trust opens `canonical_weather_missing`. |
| `src/lib/eddy/rain-lag.ts` (`RAIN_LAG`) | `src/lib/eddy/generate-update.ts` prompt construction | `river_characteristics.rain_lag_hours`, `rain_lag_note`, `drop_rate_note` joined by `river_id` | Logs `[EddyGen]`, omits rain-lag guidance, and Trust opens `canonical_rain_lag_missing`. |
| `src/data/eddy-quotes.ts` (`RIVER_NOTES`) | Eddy generation plus river cards, report quote, and embed static-copy paths | `river_characteristics.river_note` joined by `river_id` | Server generation omits local color and Trust opens `canonical_river_note_missing`; client static copy no longer invents a note. |

No resilience fallback is retained, so there is no deferred deletion criterion.
Database outages remain observable through existing context/query errors rather
than being disguised as valid static metadata.
