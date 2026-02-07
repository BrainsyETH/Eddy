# Senior Code Review: Eddy (Missouri Float Trip Planner)

**Reviewer:** Claude (Opus 4.6)
**Date:** 2026-02-06
**Scope:** Full codebase review - security, correctness, performance, architecture
**Codebase:** Next.js 14 + Supabase + PostGIS + TanStack Query + MapLibre

---

## Summary

Eddy is a well-structured, feature-rich application with strong domain modeling and thoughtful UX. The PostGIS integration, segment-aware gauge selection, and multi-source condition fallback chain are impressive. However, there is a **critical authentication gap** that makes every admin API endpoint publicly accessible, plus several consistency bugs in core business logic that will produce incorrect float time estimates for users.

---

## Critical Issues

### 1. All Admin API Routes Have ZERO Server-Side Authentication

**Files:** Every file under `src/app/api/admin/**`
**Severity:** Data breach / full data destruction

The admin "authentication" exists only as a client-side password gate in `useAdminAuth.ts` (line 28):

```ts
// useAdminAuth.ts:28
const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
```

This is checked in the browser and stored in `sessionStorage`. But **none of the admin API routes verify any credentials**. Every route immediately calls `createAdminClient()` (the service role key that bypasses RLS) and performs the operation:

```ts
// src/app/api/admin/access-points/route.ts:13
const supabase = createAdminClient(); // No auth check whatsoever
```

**Impact:** Anyone with `curl` can:
- `GET /api/admin/access-points` — read all access points including unapproved
- `POST /api/admin/access-points` — create arbitrary access points
- `PUT /api/admin/access-points/[id]` — modify any access point's data
- `DELETE /api/admin/access-points/[id]` — delete access points
- `POST /api/admin/blog` — publish blog posts
- `POST /api/admin/upload` — upload files to Vercel Blob storage
- `POST /api/admin/images` — upload files to Supabase Storage
- `PUT /api/admin/rivers/[id]/visibility` — hide rivers from the public site
- `PUT /api/admin/gauges/[id]` — modify gauge thresholds (affects all condition ratings)

**Fix:** Add server-side middleware to all `/api/admin/*` routes. Either:
- (a) Use Supabase Auth: verify JWT via `supabase.auth.getUser()` and check the `user_roles` table (the `is_admin()` function already exists in the DB)
- (b) At minimum, verify a bearer token in the `Authorization` header against a server-side secret (not `NEXT_PUBLIC_`)

```ts
// Example: create a shared admin auth guard
async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const supabase = await createServerClient(); // not admin client
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null; // authorized
}
```

### 2. Admin Password Exposed in Client Bundle

**File:** `src/hooks/useAdminAuth.ts:28`

```ts
const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
```

The `NEXT_PUBLIC_` prefix causes Next.js to inline this value into the client-side JavaScript bundle. Anyone can extract the password from browser DevTools or by reading the built JS files. Additionally, when no password is configured (line 31-34), admin access is granted to everyone.

**Fix:** Remove the `NEXT_PUBLIC_` prefix entirely. Admin authentication should happen server-side only (see fix for issue #1). The client should authenticate via Supabase Auth (email/password login) and the server validates the session.

### 3. RLS Policy Allows Full Update of Any Float Plan

**File:** `supabase/migrations/00004_rls_policies.sql:68-71`

```sql
CREATE POLICY "Anyone can update float plan view count"
    ON float_plans FOR UPDATE
    USING (true)
    WITH CHECK (true);
```

Despite the comment saying "view count", this policy allows **any anonymous user** to update **any column** of **any float plan** — including `river_id`, `distance_miles`, `estimated_float_minutes`, `condition_at_creation`, etc. An attacker could corrupt all saved float plans.

**Fix:** Restrict the policy to only allow incrementing `view_count`:

```sql
CREATE POLICY "Anyone can increment float plan view count"
    ON float_plans FOR UPDATE
    USING (true)
    WITH CHECK (
        -- Only allow view_count and last_viewed_at to change
        river_id = OLD.river_id AND
        start_access_id = OLD.start_access_id AND
        end_access_id = OLD.end_access_id AND
        vessel_type_id = OLD.vessel_type_id AND
        distance_miles = OLD.distance_miles AND
        estimated_float_minutes = OLD.estimated_float_minutes AND
        condition_at_creation = OLD.condition_at_creation AND
        gauge_reading_at_creation = OLD.gauge_reading_at_creation AND
        short_code = OLD.short_code AND
        created_at = OLD.created_at
    );
```

Or better: use a database function with `SECURITY DEFINER` to increment the view count, and remove the UPDATE policy entirely.

### 4. Float Time Calculation Uses Different Speed Multipliers in DB vs Client

**Files:**
- `src/lib/calculations/floatTime.ts:38-45`
- `supabase/migrations/00003_functions.sql:180-185` (`calculate_float_time`)

The client-side calculation:
```ts
case 'very_low': speedMph = speeds.speedLowWater * 0.95;  break;
case 'too_low':  speedMph = speeds.speedLowWater * 0.87;  break;
```

The database function:
```sql
WHEN 'very_low' THEN speed_low_water * 0.75
WHEN 'too_low'  THEN speed_low_water * 0.5
```

**Impact:** For a canoe at 2.5 mph low-water speed on a 10-mile float:
- Client (very_low): `10 / (2.5 * 0.95)` = **4h 13m**
- Database (very_low): `10 / (2.5 * 0.75)` = **5h 20m**
- Client (too_low): `10 / (2.5 * 0.87)` = **4h 36m**
- Database (too_low): `10 / (2.5 * 0.5)` = **8h 0m**

Users will see dramatically different estimates depending on which code path runs. The plan API currently uses the client-side calculation (`calculateFloatTime`), but the DB function exists and could be called by other code paths.

**Fix:** Pick one set of multipliers (the DB values are more conservative and probably safer for trip planning), put them in a shared constant, and use that constant everywhere.

### 5. `get_river_condition()` Ignores `threshold_unit` Column

**File:** `supabase/migrations/00003_functions.sql:117-165`

The `river_gauges` table has a `threshold_unit` column (`'ft'` or `'cfs'`), but the `get_river_condition()` function always compares `gauge_height_ft` against thresholds:

```sql
WHEN lr.gauge_height_ft >= pg.level_dangerous THEN 'Dangerous'
```

If a gauge is configured with `threshold_unit = 'cfs'`, its thresholds are discharge values (e.g., `level_optimal_min = 200` meaning 200 cfs), but the function compares them against gauge height in feet (e.g., 3.5 ft). This will produce completely wrong condition codes.

The client-side `computeCondition()` in `lib/conditions.ts` correctly handles both units, but the DB function does not.

**Fix:** Update `get_river_condition()` to check `threshold_unit` and compare against either `gauge_height_ft` or `discharge_cfs` accordingly, mirroring the logic in `lib/conditions.ts`.

---

## Important Improvements

### 6. No Rate Limiting on Public Endpoints

**Files:** `src/app/api/feedback/route.ts`, `src/app/api/plan/route.ts`

The feedback endpoint accepts user-submitted content with no rate limiting, CAPTCHA, or abuse protection. The plan endpoint triggers multiple external API calls (USGS, Mapbox, potentially USGS statistics) per request.

**Impact:**
- Spam: Automated scripts can flood the feedback table
- Cost: Each plan request can trigger 2-3 Mapbox API calls (geocoding + directions) which are metered
- DoS: The conditions endpoint chains ~5 sequential API/DB calls; high traffic amplifies this

**Fix:** Add rate limiting via Vercel's `@vercel/kv` + a simple token bucket, or use Next.js middleware with `headers()` to enforce per-IP limits. At minimum, add rate limiting to `/api/feedback` and `/api/plan`.

### 7. No Input Length Validation on Text Fields

**File:** `src/app/api/feedback/route.ts:16-17`

```ts
const { feedbackType, userName, userEmail, message, imageUrl, context } = body;
```

The message field is validated for presence but not length. A malicious user could submit a 100MB string in the `message` field, consuming database storage and potentially causing OOM errors.

**Fix:** Add `message.length > 5000` checks. Apply similar limits to `userName`, `description`, `localTips`, and other text fields across admin endpoints.

### 8. Blog Content Stored as Raw HTML Without Sanitization

**File:** `src/app/api/admin/blog/route.ts:111` and admin access-point `localTips` field

Blog `content` and access point `localTips` store raw HTML from the TipTap editor. If this HTML is rendered with `dangerouslySetInnerHTML` (which is the standard pattern for TipTap content), there's an XSS risk if:
- An attacker gains admin access (easy given issue #1)
- The TipTap editor is misconfigured to allow script injection

**Fix:** Sanitize HTML server-side before storage using a library like `dompurify` (with `jsdom`) or `sanitize-html`. Strip `<script>`, `<iframe>`, `onerror`, `onload`, and other dangerous attributes.

### 9. Cron Endpoint Accessible via GET and Bypasses Auth in Dev

**File:** `src/app/api/cron/update-gauges/route.ts:194-196`

```ts
export async function GET(request: NextRequest) {
  return POST(request);
}
```

And lines 18-22:
```ts
const isDev = process.env.NODE_ENV === 'development';
if (!isDev) { /* auth check */ }
```

The GET handler means the cron endpoint is accessible from a browser URL bar. In development, no auth is required at all. If `NODE_ENV` is misconfigured in production (or during Vercel preview deployments), the auth check is skipped.

**Fix:** Remove the GET export. For dev testing, use `curl -X POST` with a test secret. Don't rely on `NODE_ENV` for security decisions — always require the `CRON_SECRET` header and have a dev-specific secret.

### 10. Conditions API Makes 5+ Sequential Database/API Calls

**File:** `src/app/api/conditions/[riverId]/route.ts`

The conditions endpoint execution flow is:
1. Query access point (if `putInAccessPointId` provided)
2. Call `get_river_condition_segment` or `get_river_condition` RPC
3. Query `river_gauges` with joins to `gauge_stations`
4. Call `fetchGaugeReadings()` (external USGS API)
5. For each linked gauge: query `gauge_readings` (N+1 problem)
6. If DB returned unknown: additional gauge threshold query + another USGS call
7. Call `fetchDailyStatistics()` (another external USGS API call)

These are all sequential. On a cold cache with 3 gauges, this can take 3-5 seconds.

**Fix:**
- Parallelize independent calls using `Promise.all()` — steps 2 and 3 are independent; steps 4 and 5 can be batched
- The N+1 in step 5 (querying `gauge_readings` per gauge) should be a single query with `IN` clause
- Consider caching USGS responses at the API level (they're already cached by `next: { revalidate }` but only on the same server instance)

### 11. `conditionCodeToFlowRating()` Duplicated Across Files

**Files:**
- `src/app/api/plan/route.ts:27-36`
- `src/app/api/conditions/[riverId]/route.ts:89-99`

Identical function defined in two separate files. If one is updated without the other, condition mapping will diverge.

**Fix:** Export from a shared location (e.g., `lib/calculations/conditions.ts` which already has related logic).

### 12. `getCoordinates()` Type Guard Duplicated 3+ Times

**Files:**
- `src/app/api/admin/access-points/route.ts:57-64`
- `src/app/api/admin/access-points/[id]/route.ts:70-77`
- (same pattern in the PUT handler at line 448-455)

The exact same function is copy-pasted across multiple admin routes.

**Fix:** Move to `lib/utils/geo.ts` which already has `getPointCoordinates()` — a function with the same purpose. Replace all copies with the existing util.

---

## Nice-to-Have Refinements

### 13. Debug Console.log Statements in Production

**File:** `src/app/api/plan/route.ts:193-196, 211-216`

```ts
console.log('[Plan API] Segment-aware gauge selection:', { ... });
console.log('[Plan API] Condition result:', { ... });
```

These log on every plan request in production, adding noise to logs and slightly impacting performance.

**Fix:** Remove or wrap in `process.env.NODE_ENV === 'development'` check.

### 14. Missouri Bounds Defined in Two Places with Different Values

**Files:**
- `src/constants/index.ts:14-19`: `minLng: -95.77, maxLng: -89.10, minLat: 35.99, maxLat: 40.61`
- `src/lib/utils/geo.ts:58-63`: `minLng: -96.5, maxLng: -88.9, minLat: 35.9, maxLat: 40.7`
- Admin routes hardcode: `latitude < 35.9 || latitude > 40.7 || longitude < -96.5 || longitude > -88.9`

Three different definitions of "Missouri bounds" with different values.

**Fix:** Use a single source of truth. Export from `constants/index.ts` and import everywhere.

### 15. No `staleTime` or `gcTime` on Several Hooks

**Files:** `src/hooks/useRivers.ts`, `src/hooks/useVesselTypes.ts`, `src/hooks/useAccessPoints.ts`

These hooks inherit the default `staleTime: 60 * 1000` (1 minute) from the QueryClient. Rivers and vessel types change very infrequently — they should have much longer stale times to avoid unnecessary refetches.

**Fix:**
```ts
// useRivers.ts
staleTime: 10 * 60 * 1000,  // 10 minutes (rivers barely change)

// useVesselTypes.ts
staleTime: 60 * 60 * 1000,  // 1 hour (vessel types are basically static)
```

### 16. Feedback POST Inserts via Anon Key Without RLS Policy for `feedback` Table

**File:** `src/app/api/feedback/route.ts:50-67`

The feedback endpoint uses `createClient()` (anon key), but I don't see a `CREATE POLICY` for `feedback` in the RLS migration (`00004_rls_policies.sql`). This means either:
- RLS is not enabled on `feedback` (in which case anon can do anything)
- RLS is enabled but there's no INSERT policy (in which case the insert will silently fail)

The table was likely added in a later migration, but the RLS policy may be missing.

**Fix:** Verify that the `feedback` table has RLS enabled with an appropriate INSERT policy for anonymous users, and a SELECT policy restricted to admins.

### 17. `parseFloat()` on Potentially Null Values Without Guards

**File:** `src/app/api/plan/route.ts:185-186`

```ts
const distanceMiles = parseFloat(segmentData.distance_miles);
const putInMile = parseFloat(segmentData.start_river_mile);
```

If `distance_miles` or `start_river_mile` is null (e.g., if the DB function returns unexpected data), `parseFloat(null)` returns `NaN`, which will propagate silently through calculations producing nonsensical results like "NaN miles, ~NaN hours".

**Fix:** Add null checks and return a clear error:
```ts
if (!segmentData.distance_miles) {
  return NextResponse.json({ error: 'Could not calculate distance' }, { status: 500 });
}
```

### 18. Weather API Calls Not Cached Optimally

**File:** `src/lib/weather/openweather.ts:45`

```ts
const response = await fetch(url);  // No cache headers
```

The `fetchWeather()` and `fetchForecast()` functions don't use Next.js `revalidate` caching, unlike the USGS and Mapbox calls. Every weather request hits the OpenWeather API directly.

**Fix:** Add `next: { revalidate: 600 }` (10 minutes) for current weather and `next: { revalidate: 3600 }` (1 hour) for forecasts.

---

## Design / Architecture Suggestions

### 19. Consider Server Components for Static Data

The river detail page, access point pages, and gauge dashboard could benefit from Server Components for their initial data fetch. Currently, all data fetching goes through client-side hooks (TanStack Query), which means:
1. The page renders empty
2. JavaScript loads and hydrates
3. API calls fire
4. Data returns and the page fills in

For SEO-critical pages (river pages, access point pages), the initial data should be fetched server-side. The current architecture results in empty content for search engine crawlers that don't execute JavaScript.

**Recommendation:** Use Next.js Server Components for the initial page shell with data, and hydrate client-side hooks for real-time updates (conditions, weather). This is a classic "fetch on server, subscribe on client" pattern.

### 20. Introduce an API Auth Middleware Pattern

Rather than adding auth checks to each admin route individually, create a Next.js route group or middleware pattern:

```
src/app/api/admin/
  middleware.ts  <-- Verify admin auth here, once
  access-points/route.ts
  blog/route.ts
  ...
```

Or use a higher-order function:
```ts
export const GET = withAdminAuth(async (request, user) => {
  // user is guaranteed to be an admin here
});
```

This prevents future routes from accidentally being shipped without auth.

### 21. Consider a Proper Migration Versioning System

There are 34+ migration files using numeric prefixes (`00001_`, `00002_`, etc.). As the project grows, consider:
- Using Supabase's built-in migration system (`supabase migration new`)
- Timestamped migrations instead of sequential numbers
- A migration runner that tracks which migrations have been applied (rather than running all)

### 22. Separate Condition Computation Into a Single Authoritative Module

Currently, river condition computation exists in:
1. `lib/conditions.ts` (client-shared, supports ft + cfs)
2. `api/plan/route.ts` (inline, ft only)
3. `api/conditions/[riverId]/route.ts` (inline, ft only)
4. `get_river_condition()` SQL function (ft only)

This should be consolidated. The `lib/conditions.ts` implementation is the most complete. The inline versions in API routes should import from it. The DB function should be updated to match.

### 23. Add OpenAPI / Swagger Documentation

With 20+ API endpoints, the project would benefit from auto-generated API documentation. Consider `next-swagger-doc` or a hand-maintained OpenAPI spec. This also enables API contract testing.

---

## What's Done Well

- **PostGIS integration** is excellent — river snapping, segment extraction, and distance calculations are properly implemented with spatial indexes
- **Segment-aware gauge selection** is a thoughtful feature that improves accuracy for longer rivers
- **USGS fallback chain** (DB readings -> live USGS -> primary gauge fallback) is robust
- **TanStack Query usage** is well-configured with proper cache keys, stale times, and placeholder data
- **Type safety** is consistently applied across API boundaries
- **Condition-aware caching** in the Mapbox integration (shorter cache during dangerous conditions) is clever
- **RLS policies** are well-structured for the public-facing data (approved access points, active hazards)
- **Cron job** with adaptive high-frequency polling based on rate of change is sophisticated
- **Input validation** on admin endpoints is thorough (coordinate bounds, enum values, type checks)
