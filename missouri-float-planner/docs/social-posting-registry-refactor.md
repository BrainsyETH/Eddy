# Plan: Post-Type Registry Refactor (Social Posting Subsystem)

## Context

Social posting is assembled in **three** places that drift from each other, and each
post type is rendered by **two** backends (Remotion video + OG image) with no shared
contract. The result is the bugs we hit: weekly types post *video* on the cron but the
*OG image* from the admin button; `route_draw` (the new self-drawing route) is only
half-wired; `asVideo` is honored on some paths and ignored on others; and the
"top-3 floatable" + severity logic is copy-pasted three times under three different
names (`WEEKLY_SEVERITY` / `WEEKEND_SEVERITY` / `FORECAST_SEVERITY`, identical values).

Adding or changing a post type today means editing ~6 files. This refactor makes each
post type a single declarative entry that every consumer reads from, so behavior can't
diverge and a new type is one entry.

**Goal:** one registry + one assembler + one executor, consumed by quick-post, the cron,
the scheduler, and a registry-driven admin UI. Behavior-preserving, migrated incrementally.

Decision locked: **plan only** (this doc); implement after review.

---

## Current shape (verified)

| Concern | Location |
|---|---|
| Manual quick-post | `src/app/api/admin/social/quick-post/route.ts` — `dispatchVideoRender`, `postDigest`, `postHighlight`, `postTip`, `postWeekly`, `publishToPlatforms` |
| Cron execution | `src/app/api/cron/post-social/route.ts` — `buildRenderData()` + video/image loop |
| Scheduling policy | `src/lib/social/post-scheduler.ts` — `getScheduledPosts()` (config/time/dedup gating) |
| Video dispatch | `src/lib/social/video-renderer.ts` — `getCompositionForPost()`, `triggerVideoRender()` |
| Publish | `src/lib/social/{facebook,instagram}-adapter.ts` — `publishPost()` |
| Captions | `src/lib/social/content-formatter.ts` — `format*Caption()` |
| OG image | `src/app/api/og/social/route.tsx` — `?type=digest|highlight|tip|forecast|section|trend|warning` |
| Admin UI | `src/app/admin/social/page.tsx` — Quick Post panel + schedule matrix "Post Now" |
| Types/config | `src/lib/social/types.ts` — `PostType`, `MediaType`, `ScheduledPost`, `SocialConfig`, `MediaSchedule`, `WeeklyReelConfig` |

**Duplication to collapse:** forecast top-3 filter+sort (×3), section/trend re-pick (×3),
live-condition enrichment (3 patterns: inline `overlayLiveConditions`, `buildLiveConditionsMap`,
per-slug lookups), caption-formatter selection (if/else in quick-post + scheduler), and
postType→composition mapping.

---

## Target design

### 1. The registry — new file `src/lib/social/post-types.ts`

One entry per post type is the single source of truth. Each declares its inputs, supported
media, both render backends, and pure functions for context → caption / render props / image url.

```ts
export type PostKind =
  | 'daily_digest' | 'river_highlight' | 'weekly_forecast'
  | 'section_guide' | 'weekly_trend' | 'route_draw' | 'tip';

export interface PostContext {           // assembled ONCE, shared by caption + render
  rivers?: RiverLite[];                   // digest / forecast
  update?: EddyUpdateLive;                // highlight
  section?: SectionLive;                  // section_guide / route_draw
  trend?: NotableTrendLive;               // weekly_trend
  globalQuote?: string;
  dateLabel: string;
  title?: string;
  riverSlug?: string | null;
}

export interface PostTypeDef {
  id: PostKind;
  label: string;                          // admin UI
  needs: 'none' | 'river' | 'content';    // what extra input the UI must collect
  media: MediaType[];                     // ['image','video'] | ['video'] | ['image']
  composition?: string;                   // Remotion id (video backend)
  ogType?: string;                        // /api/og/social?type=... (image backend)
  /** ONE assembler: live conditions → context. Used by quick-post, cron, scheduler. */
  buildContext(a: { supabase; riverSlug?; contentId?; date?: Date }): Promise<PostContext | null>;
  caption(ctx: PostContext, platform: SocialPlatform, custom: SocialCustomContent[]): { caption: string; hashtags: string[] };
  renderProps(ctx: PostContext): Record<string, unknown>;   // → composition inputProps
  imageUrl(ctx: PostContext, platform: SocialPlatform, baseUrl: string): string;
}

export const POST_TYPES: Record<PostKind, PostTypeDef> = { /* entries below */ };
```

- `buildContext` **moves** the existing assembly logic out of `buildRenderData` and the
  quick-post helpers — one copy each. (e.g. forecast: fetch updates → enrich → filter
  floatable → sort by severity → top 3.)
- `caption` delegates to the existing `format*Caption()` fns (unchanged).
- `renderProps` replaces the per-type branches of `getCompositionForPost`.
- `imageUrl` replaces the scattered `/api/og/social?type=...` string-building.
- `route_draw` entry **reuses** the section assembler with `composition: 'social-route-portrait'`,
  `media: ['video']`, no `ogType` — so it appears everywhere automatically.

### 2. Shared severity/floatable — fold into `shared/condition-system.ts`

`CONDITION_SYSTEM[code].severity` already exists (alert ordering). Add ONE exported
"weekend floatability" helper there (the `flowing<good<high` ordering + the floatable set),
and delete `WEEKLY_SEVERITY` / `WEEKEND_SEVERITY` / `FORECAST_SEVERITY` + the three
`*_FLOATABLE` sets. Keep the comment that this is distinct from alert severity.

### 3. The executor — new file `src/lib/social/execute-post.ts`

Collapses `dispatchVideoRender` + `postDigest/Highlight/Tip/Weekly` + `publishToPlatforms`
+ the cron's video/image loop into one function:

```ts
async function executePost(def, ctx, { supabase, platforms, mediaType }): Promise<Result>
```
- `mediaType === 'video'` (and `def.composition`): clear today's conflicting rows → insert
  `status:'rendering'` per platform → `triggerVideoRender({ compositionId: def.composition,
  inputProps: def.renderProps(ctx), ... })` once → **on dispatch failure, fall back to image**
  (preserve the existing fallback in `post-social`).
- else (image): insert `status:'publishing'` → `def.imageUrl(...)` → `adapter.publishPost()`
  → update status. (preserve the delete-today + dedup behavior.)

This is the one place that touches `social_posts` + adapters + `triggerVideoRender`.

### 4. Consumers become thin

- **`quick-post/route.ts`** → parse `{ type, riverSlug?, contentId?, platforms, mediaType }`,
  `def = POST_TYPES[type]`, `ctx = await def.buildContext(...)`, `executePost(def, ctx, ...)`.
  Delete the five helpers (~600 → ~80 lines). `mediaType` is honored for **every** type
  (closes the weekly-as-video gap).
- **`cron/post-social/route.ts`** → for each due item from the scheduler:
  `executePost(POST_TYPES[item.postType], await def.buildContext(...), { mediaType: item.mediaType })`.
  Delete `buildRenderData()` and the bespoke loop (keep retry handling).
- **`post-scheduler.ts`** → keep all gating (config flags, `media_schedule` matrix, time
  windows, per-river `isDueNow`, `hasPostedToday`). It stops building captions/imageUrls;
  it emits lightweight "due intents" `{ postType, riverSlug, mediaType }`. Caption/image now
  come from the registry at execution time. (Removes scheduler's caption duplication.)
- **`video-renderer.ts`** → `getCompositionForPost` is replaced by `def.composition` +
  `def.renderProps`; keep `triggerVideoRender` as-is. (Can leave a thin shim or delete.)

### 5. Admin UI — registry-driven (`src/app/admin/social/page.tsx`)

Replace the two divergent surfaces with one component that maps over `POST_TYPES`:
- Each row: label, a picker shown only when `needs !== 'none'` (river dropdown / content
  dropdown), a **media toggle** shown only when `media.length > 1`, and a **Post Now** button →
  `POST /api/admin/social/quick-post { type, mediaType, riverSlug?, contentId?, platforms }`.
- The day×media **schedule matrix** stays (it configures `media_schedule` for the cron), but
  its "Post Now" actions go through the same endpoint uniformly.
- `route_draw` and any future type render automatically — no UI edits.

### 6. Types (`src/lib/social/types.ts`)

Add `'route_draw'` (and `'branded_loop'` if we want it postable) to `PostType`. Add the
`PostKind`/`PostContext`/`PostTypeDef` interfaces (or co-locate in `post-types.ts`).

---

## Migration (incremental, behavior-preserving)

Each phase is independently shippable and verified against current output.

- **Phase 0 — de-dupe severity.** Single weekend-floatability helper in
  `shared/condition-system.ts`; replace the 3 copies. *Tiny, isolated.*
- **Phase 1 — registry + executor.** Add `post-types.ts` (entries for the 6 existing types)
  by MOVING assembly out of `buildRenderData`/quick-post helpers, and `execute-post.ts`.
  Nothing consumes them yet.
- **Phase 2 — quick-post on registry.** Rewrite the route to `buildContext`+`executePost`;
  delete the five helpers. Verify each type's caption/imageUrl/composition props match
  current (snapshot compare). `mediaType` honored for all types.
- **Phase 3 — cron on registry.** Replace `buildRenderData` + loop with
  scheduler-intents + `executePost`. Preserve video-grouping, image fallback, retries.
- **Phase 4 — scheduler emits intents.** Drop caption/imageUrl building from the scheduler.
- **Phase 5 — admin UI from registry.** Unify Quick Post + Post Now into one mapped list;
  add media toggles where supported.
- **Phase 6 — `route_draw` entry.** Reuse the section assembler; it now shows up in admin +
  cron + quick-post for free. (Effectively done once Phase 1/5 land.)

---

## Critical files

- New: `src/lib/social/post-types.ts`, `src/lib/social/execute-post.ts`
- Edit: `src/app/api/admin/social/quick-post/route.ts`, `src/app/api/cron/post-social/route.ts`,
  `src/lib/social/post-scheduler.ts`, `src/lib/social/video-renderer.ts`,
  `src/app/admin/social/page.tsx`, `src/lib/social/types.ts`, `shared/condition-system.ts`
- Reused unchanged: `content-formatter.ts` (`format*Caption`), `{facebook,instagram}-adapter.ts`,
  `og/social/route.tsx`, the Remotion compositions.

## Risks & mitigations

- **Caption/URL drift during port** → snapshot each type's `{caption, imageUrl, renderProps}`
  before and after; diff must be empty (Phase 2/3 gate).
- **Lose the video→image fallback** on dispatch failure → port it explicitly into `executePost`
  and assert with a forced-failure dry run.
- **Section/trend determinism** (date-based rotation must match scheduler) → `buildContext`
  takes the same `date` the scheduler used; cover with a same-day re-pick test.
- **Dedup/delete-today semantics** (`hasPostedToday`, delete conflicting rows) → centralize in
  `executePost`, preserve exact status sets (`pending|publishing|published|rendering`).

## Verification

- Per type, per platform: dry-run quick-post and diff `{caption, imageUrl, compositionId,
  inputProps}` vs current `main`.
- `npx tsc --noEmit` (app), Remotion `tsc`, `npm run lint`.
- Trigger the `post-social` cron with `skipTimeCheck` against a staging config; confirm same
  rows/renders as before.
- `route_draw`: render `social-route-portrait` still + one end-to-end quick-post (video).
- Confirm a brand-new type can be added with a single registry entry (no other file edits).
