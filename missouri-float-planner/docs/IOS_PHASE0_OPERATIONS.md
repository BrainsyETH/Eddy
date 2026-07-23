# Eddy iOS Phase 0 operations

## Required production configuration

- Supabase: anonymous sign-ins enabled; native Apple provider configured; migrations through `00187` applied from source.
- RevenueCat: Eddy+ entitlement and iOS products configured; restore behavior set deliberately; webhook points to `/api/webhooks/revenuecat` and sends the exact `REVENUECAT_WEBHOOK_AUTHORIZATION` value.
- Expo/EAS: replace the placeholder project ID in `eddy-ios/app.json`; configure APNs credentials; use an Eddy-owned, offline-permitted map style before enabling offline maps.
- Vercel: set `IOS_MIN_SUPPORTED_VERSION`, `IOS_LATEST_VERSION`, `IOS_FEATURE_*`, `REVENUECAT_WEBHOOK_AUTHORIZATION`, existing Supabase keys, and `CRON_SECRET`.
- App builds: set the public values documented in `eddy-ios/.env.example`; never place service-role or RevenueCat secret keys in Expo variables.

## Smoke test

1. Run the clean migration CI job and confirm the Phase 0 tables and RPCs are present.
2. Create an anonymous iOS session, star two rivers, complete native Apple sign-in, and verify `/api/me/merge-anonymous` unions the stars under the permanent UUID.
3. Configure RevenueCat with that UUID, complete a sandbox trial, replay the webhook once, and verify a duplicate delivery is acknowledged without changing state.
4. Create a one-shot floatable subscription and register a physical-device Expo token.
5. Insert or trigger a qualifying river transition, run `/api/cron/deliver-ios-push`, wait for the receipt pass, and verify exactly one notification and one terminal `push_deliveries` row.
6. Confirm `/api/app-config` can disable purchases/push and force an update without an app release.

## Monitoring and recovery

- Query `ios_delivery_health` with the service role for stale outbox events, overdue deliveries, disabled tokens, and latest RevenueCat webhook time.
- Alert when an update-gauges or deliver-ios-push cron misses two expected runs, any outbox event is stale for 15 minutes, webhook lag exceeds an hour during active billing tests, or receipt failures spike.
- Re-run failed RevenueCat events only from their ledger payload after fixing the cause; event IDs remain the idempotency key.
- Do not enable `IOS_FEATURE_OFFLINE_MAPS` until `EXPO_PUBLIC_OFFLINE_STYLE_URL` points to tiles Eddy is permitted to store.
