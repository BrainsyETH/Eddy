# Eddy — Site Review & River Scaling Playbook

> Internal operations guide for the Eddy team. Covers site improvement priorities and a repeatable process for onboarding new Missouri rivers.

---

## Part 1: Site Review & Improvement Roadmap

### P0 — Data Quality (Affects user trust)

#### Gauge Threshold Calibration

Five rivers currently have placeholder or loosely-calibrated gauge thresholds, which may show inaccurate condition badges:

| River | Status | Action |
|-------|--------|--------|
| Meramec | Needs calibration | Research Sullivan gauge historical data |
| Niangua | Needs calibration | Research Bennett Spring gauge data |
| Big Piney | Needs calibration | Research gauge near Ft. Leonard Wood |
| Huzzah Creek | Needs calibration | Research Davisville gauge data |
| Courtois Creek | Needs calibration | Research Berryman gauge data |

**How to calibrate:** Download 1-year historical data from USGS Water Services for each gauge. Identify percentiles:
- `level_too_low` — bottom 10th percentile (not floatable)
- `level_low` — 10th-25th percentile (scraping likely)
- `level_optimal_min` — 25th percentile (ideal begins)
- `level_optimal_max` — 75th percentile (ideal ends)
- `level_high` — 75th-90th percentile (use caution)
- `level_dangerous` — above 90th percentile (do not float)

Cross-reference percentiles with local outfitter knowledge — statistical analysis alone won't capture river-specific nuances (e.g., Huzzah is scrapy below 3.0 ft but optimal at 3.5 ft).

Update thresholds in the `river_gauges` table via admin panel at `/admin/gauges`.

#### Access Point Data Audit

Review each river's access points for completeness:
- [ ] All access points have at least one photo
- [ ] Descriptions filled in (not just name)
- [ ] Amenities array populated (parking, restrooms, camping, boat_ramp, picnic)
- [ ] Parking info present (capacity, surface type)
- [ ] Google Maps URL linked
- [ ] Fee information accurate and current

Use admin panel at `/admin/access-points` to review and update.

---

### P1 — Accessibility

Only 13 ARIA labels exist across the entire codebase. Key fixes:

| Component | File | Fix |
|-----------|------|-----|
| CollapsibleSection | `src/components/ui/CollapsibleSection.tsx` | Add `aria-expanded` attribute tied to open/close state |
| Icon-only buttons | Multiple files | Add `aria-label` describing the action (e.g., "Close menu", "Share plan") |
| Gauge updates | `src/components/gauge/CurrentReadingCard.tsx` | Wrap dynamic reading in `aria-live="polite"` region |
| Chat messages | `src/components/chat/ChatPanel.tsx` | Add `aria-live="polite"` to message container |
| Decorative images | Multiple files | Add `aria-hidden="true"` to otter mascot, wave SVGs, decorative borders |
| Map overlays | `src/components/map/MapContainer.tsx` | Add `role="region"` + `aria-label="Interactive river map"` |

---

### P1 — Error Handling

| Issue | Location | Fix |
|-------|----------|-----|
| Public pages fail silently | `/rivers`, `/gauges`, `/plan` pages | Add try/catch with user-facing error UI |
| No retry on fetch failure | Gauge/condition API calls | Add exponential backoff (1s, 2s, 4s) with 3 retries |
| Empty state returns null | `src/components/home/FeaturedRivers.tsx` | Show friendly "No rivers available" message instead of rendering nothing |
| Single root error boundary | `src/app/error.tsx` | Add `error.tsx` per route segment: `/rivers/[slug]/error.tsx`, `/gauges/[slug]/error.tsx`, `/plan/[shortCode]/error.tsx` |
| Missing 404 pages | `/rivers/[slug]`, `/gauges/[slug]` | Add `not-found.tsx` that shows a helpful message when slug doesn't resolve |

---

### P2 — Performance & Polish

| Item | Notes |
|------|-------|
| **Dark mode** | CSS variables and Tailwind config already exist (`[data-theme="dark"]` selector in `globals.css`). Need: a toggle in SiteHeader, persist preference in localStorage, apply class to `<html>` |
| **Loading skeletons** | Add `loading.tsx` per route segment for smoother client-side navigation |
| **Route-level not-found** | `/rivers/[slug]/not-found.tsx` and `/gauges/[slug]/not-found.tsx` |
| **Image placeholders** | Add blur placeholder data URLs to hero images for faster perceived load |

---

### P2 — Content & UX

| Item | Impact |
|------|--------|
| Blog river tagging | Allow filtering blog posts by river — useful as content grows |
| Embed showcase | `/embed` page could show live widget previews instead of just descriptions |
| Home page conditions overview | Add a quick "conditions at a glance" strip to hero showing all 8 rivers |
| Plan share preview | Ensure OG image is included in share links (already generates, may need meta tag in share flow) |

---

## Part 2: River Scaling Playbook

### Overview

Adding a new river to Eddy follows a 5-phase process using existing scripts and admin tools. No code changes are typically required — the system is designed for data-driven river additions.

Current rivers: Meramec, Current, Eleven Point, Jacks Fork, Niangua, Big Piney, Huzzah Creek, Courtois Creek (8 total).

Expansion pool: 28+ rivers documented in `floatmissouri_rivers.json`.

---

### Per-River Data Requirements

Every river needs these items before going live:

| # | Item | Source | Tool/Script | Required |
|---|------|--------|-------------|----------|
| 1 | River geometry (LineString) | NHD via USGS WFS | `scripts/import-nhd-rivers.ts` | **Yes** |
| 2 | Direction verification | Manual review on map | `scripts/verify-river-directions.ts` | **Yes** |
| 3 | Access points (5+ minimum) | MDC, NPS, outfitters, field research | CSV template → `scripts/import-access-points-csv.ts` → `scripts/snap-access-points.ts` | **Yes** |
| 4 | USGS gauge station(s) | USGS Water Services | `scripts/fetch-gauge-stations.ts` + admin `/admin/gauges` | **Yes** |
| 5 | Gauge thresholds (6 levels) | Historical USGS data + outfitter input | Admin `/admin/gauges` | **Yes** |
| 6 | Hazards (dams, strainers, rapids) | Outfitters, community, field research | Admin `/admin/hazards` | **Yes** |
| 7 | POIs (springs, caves, viewpoints) | NPS API (ONSR rivers), manual entry | Admin `/admin/pois` + cron sync | Recommended |
| 8 | Shuttle services / outfitters | Local business research | Direct DB or admin panel | Recommended |
| 9 | Knowledge base entry | Guidebooks, local expertise | Edit `EDDY_KNOWLEDGE.md` | **Yes** |
| 10 | River section config | Analysis: do upper/lower conditions differ? | Edit `src/data/river-sections.ts` | If applicable |
| 11 | Hero image + access point photos | Photography, CC licenses, outfitter partnerships | Admin `/admin/images` | Recommended |

---

### Step-by-Step Onboarding Process

#### Phase 1: Research (2-4 hours)

1. **Find NHD Feature ID** — Search the [USGS National Map](https://apps.nationalmap.gov/viewer/) for the river. Note the NHD Permanent Identifier (e.g., `9908874` for Meramec).

2. **Find USGS gauge stations** — Search [USGS Water Services](https://waterdata.usgs.gov/nwis) for stations on or near the river. Record site IDs (e.g., `07019000`). Prefer stations with both gauge height (ft) and discharge (cfs) data.

3. **Compile access points** — Sources:
   - Missouri Dept. of Conservation (MDC) conservation area maps
   - National Park Service (for ONSR rivers)
   - County road atlases and satellite imagery
   - Local outfitter websites (shuttle routes reveal access points)
   - `floatmissouri_mile_markers.json` may have historical data

4. **Identify hazards** — Check:
   - Outfitter warning pages
   - Missouri Stream Team reports
   - Historical mile marker data in `floatmissouri_mile_markers.json`
   - Community forums (Missouri Canoe & Floaters Association)

5. **Research gauge thresholds** — Download 1-year historical data from USGS. Calculate percentiles for the 6-tier condition system. Verify against outfitter "minimum floatable level" recommendations.

#### Phase 2: Data Import (2-4 hours)

1. **Add river to NHD import config:**
   ```typescript
   // In scripts/import-nhd-rivers.ts → MISSOURI_RIVERS array
   {
     name: 'Gasconade River',
     slug: 'gasconade',
     nhdFeatureId: 'XXXXXXX',  // from research
     description: '...',
     difficultyRating: 'Class I',
     region: 'Ozarks',
   }
   ```

2. **Run NHD import:**
   ```bash
   npx tsx scripts/import-nhd-rivers.ts
   ```

3. **Verify river direction** (geometry should flow downstream):
   ```bash
   npx tsx scripts/verify-river-directions.ts
   ```

4. **Prepare access points CSV** using the template at `scripts/templates/access-points-template.csv`:
   ```csv
   river_slug,name,type,latitude,longitude,is_public,ownership,description,fee_required,fee_notes
   gasconade,Hazelgreen Access,boat_ramp,37.XXX,-92.XXX,true,MDC,Public boat ramp,false,
   ```

5. **Import and snap access points:**
   ```bash
   npx tsx scripts/import-access-points-csv.ts
   npx tsx scripts/snap-access-points.ts
   npx tsx scripts/correct-access-point-miles.ts
   ```

6. **Verify on map** — Check admin geography editor at `/admin/geography` to confirm points snapped correctly.

#### Phase 3: Gauge Configuration (1-2 hours)

1. **Add gauge station** — via admin `/admin/gauges` or direct insert:
   ```sql
   INSERT INTO gauge_stations (usgs_site_id, name, location, active)
   VALUES ('07013000', 'Gasconade River near Rich Fountain', ST_Point(-91.XXX, 38.XXX, 4326), true);
   ```

2. **Link gauge to river** — in `river_gauges` table:
   ```sql
   INSERT INTO river_gauges (river_id, gauge_station_id, is_primary, threshold_unit,
     level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous)
   VALUES (
     (SELECT id FROM rivers WHERE slug = 'gasconade'),
     (SELECT id FROM gauge_stations WHERE usgs_site_id = '07013000'),
     true, 'ft',
     2.0, 3.0, 4.0, 7.0, 10.0, 15.0  -- calibrated values from research
   );
   ```

3. **Pull initial readings:**
   ```bash
   curl -X POST https://your-domain.com/api/cron/update-gauges -H "Authorization: Bearer $CRON_SECRET"
   ```

#### Phase 4: Content Entry (2-4 hours)

1. **Hazards** — Use admin panel at `/admin/hazards`:
   - For each hazard: name, type, severity, location (click map), portage info, seasonal notes
   - Types: `low_water_dam`, `strainer`, `rapid`, `portage`, `bridge_piling`, `private_property`

2. **POIs** — Use admin panel at `/admin/pois`:
   - Springs, caves, scenic viewpoints, historical sites
   - For ONSR rivers: run NPS sync cron first (`POST /api/cron/sync-nps`)

3. **Shuttle services** — Add to `shuttle_services` table:
   - Business name, phone, website, services (shuttle, rental, camping)
   - Link to access points via `shuttle_service_coverage`

4. **Knowledge base** — Add section to `EDDY_KNOWLEDGE.md`:
   ```markdown
   ## Gasconade River

   [General description of river character, spring vs rain-fed behavior]

   - [Bullet points of local knowledge items]
   - [Seasonal patterns, hazard notes, access tips]

   ### Upper Gasconade (if applicable)
   - [Section-specific knowledge]
   ```

5. **River sections** — If conditions differ meaningfully between sections, add to `src/data/river-sections.ts`:
   ```typescript
   {
     riverSlug: 'gasconade',
     riverName: 'Gasconade River',
     sections: [
       {
         sectionSlug: 'upper-gasconade',
         name: 'Upper Gasconade (Waynesville to Jerome)',
         description: '...',
       },
       // ...
     ],
   }
   ```

6. **Images** — Upload hero image and access point photos via `/admin/images`.

#### Phase 5: QA & Launch (1-2 hours)

Run through this checklist before setting `active = true`:

- [ ] **Map rendering** — River line displays on `/rivers` and `/rivers/[slug]`, zoom fits correctly
- [ ] **Access point markers** — All points visible on map, popups show correct info
- [ ] **Condition badge** — Shows current condition with correct color (verify against raw gauge reading)
- [ ] **All 6 thresholds** — Mentally verify each level maps to sensible values
- [ ] **Float planning** — Select put-in/take-out, distance calculates, float time estimates reasonable
- [ ] **Drive-back time** — Shuttle route renders on map, time estimate present
- [ ] **Eddy chat** — Ask "What are conditions on the Gasconade?" — verify knowledge base picked up
- [ ] **Eddy AI update** — Run `POST /api/cron/generate-eddy-updates`, verify output for new river
- [ ] **OG image** — Visit `/rivers/[slug]` and check that social preview image generates
- [ ] **Gauge dashboard** — New river appears on `/gauges` with correct sparkline
- [ ] **Mobile** — Spot-check river detail page on mobile viewport

**Launch:**
```sql
UPDATE rivers SET active = true WHERE slug = 'gasconade';
```

---

### Recommended Next Rivers

Prioritized by popularity, USGS gauge availability, data richness, and geographic gap-filling:

| Priority | River | Why | USGS Gauges | Est. Effort |
|----------|-------|-----|-------------|-------------|
| **1** | **Gasconade River** | Longest river fully in MO. Very popular float. Multiple USGS gauges. Fills central Ozarks gap between Meramec and Niangua. | Multiple | Medium (10-14h) |
| **2** | **North Fork of the White River** | Premier spring-fed stream. Serious paddler favorite. Rainbow trout. Good USGS coverage. | Yes | Medium (10-14h) |
| **3** | **Black River** | Crystal clear water near Lesterville. Popular. Extends eastern Ozarks coverage. Johnson Shut-Ins nearby. | Yes | Medium (8-12h) |
| **4** | **Elk River / Big Sugar Creek** | Southwest MO — currently zero coverage in that region. Popular summer floats near AR border. | Yes | Medium-High (12-16h) |
| **5** | **Bryant Creek** | Wild and remote. Pairs with North Fork for south-central Ozarks coverage. Less data available. | Limited | Low-Medium (6-10h) |
| **6** | **Bourbeuse River** | Meramec tributary. Extends St. Louis-area coverage for casual floaters. Low difficulty, easy access. | Yes | Low (4-8h) |
| **7** | **St. Francis River** | Unique character with shut-ins. Extends southeastern MO coverage. Good variety (Class I-III). | Yes | Medium (8-12h) |

### Effort Level Definitions

| Level | Hours | Characteristics |
|-------|-------|-----------------|
| **Low** | 4-8h | Well-documented river, USGS gauge available, clear access points, few hazards, outfitter info online |
| **Medium** | 8-14h | Needs threshold research, moderate access point discovery, some hazard mapping, outfitter outreach |
| **High** | 14-20h | Remote river, limited/no USGS gauge data, requires field research or outfitter interviews for access points |

---

### Scaling Milestones

| Milestone | Rivers | Target |
|-----------|--------|--------|
| **MVP** (current) | 8 rivers | Done |
| **Phase 2** | 12 rivers (+Gasconade, North Fork, Black, Bourbeuse) | +4 popular rivers with good data |
| **Phase 3** | 16 rivers (+Elk, Bryant, St. Francis, Big Creek) | Geographic completeness across MO Ozarks |
| **Phase 4** | 20+ rivers | Long-tail rivers, community-driven additions |

---

### Tips from Existing River Onboarding

Lessons learned from the initial 8 rivers:

1. **River direction matters** — Always verify geometry flows downstream before importing access points. The `verify-river-directions.ts` script exists for this reason.

2. **Snap carefully** — The `snap-access-points.ts` script projects points onto the nearest river geometry point. If a river has tight meanders, the snap can land on the wrong section. Always verify in `/admin/geography`.

3. **Threshold calibration is iterative** — Initial values from percentile analysis are a starting point. Refine based on community feedback and Eddy's condition reports over 2-4 weeks after launch.

4. **Multi-gauge rivers need distance weighting** — For long rivers (like Gasconade), conditions can differ between upper and lower sections. Use multiple gauges and set `distance_from_section_miles` accurately.

5. **EDDY_KNOWLEDGE.md is critical** — The AI chat quality depends heavily on this file. Spend time writing genuine local knowledge, not just facts. "The stretch below Alley Spring is the most beautiful but gets crowded on weekends" is more useful than "Jacks Fork is 40 miles long."

6. **Images drive engagement** — Rivers with photos get significantly more plan shares. Prioritize at least a hero image and 3-5 access point photos before launch.
