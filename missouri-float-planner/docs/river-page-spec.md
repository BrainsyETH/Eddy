# River Page & Category Spec

## Goals
- Serve all types of floaters with an emphasis on **navigability at current water level**.
- Provide river-specific, decision-ready information with clear categories.
- Allow users to plan multiple put-in/take-out pairs (shuttles) per river.
- Support curated points of interest and community warning notes.

## Primary Entry Points
1. **Home / Landing**
   - Highlights value (navigability, current level, safety).
   - Entry into a **river page**.
2. **River Page (per river)**
   - Primary planning experience: choose put-in/take-out, view shuttle + float details.
   - River-specific conditions, warnings, and curated POIs.

## River Page Layout (Recommended Sections)
### 1) River Header (At-a-Glance)
- **River name + short descriptor** (e.g., “Clear water, spring-fed”).
- **Navigability status** (e.g., “Navigable”, “Low & Draggy”, “High & Fast”).
- **USGS gauge summary** (current stage, flow, trend).
- **Last updated timestamp**.

### 2) Planner Panel (Primary Interaction)
- **Put-in / Take-out selectors** (map + list)
- **Float time estimate** (based on distance + vessel type)
- **Shuttle time estimate** (driving distance/time)
- **Trip fit badges** (tubing friendly, dog friendly, family friendly)

### 3) Conditions & Safety
- **Water level + flow** (USGS)
- **Trend** (rising/falling + last 24–72h)
- **Safety notes** (general safety reminders)
- **Community warnings** (curated or user-submitted notes)

### 4) Difficulty & Experience
- **Difficulty rating** (Beginner/Intermediate/Advanced)
- **Speed expectation** (dependent on vessel type)
- **Suitability** (tubing/canoe/kayak, dogs, kids)

### 5) Logistics
- **Shuttle info** (parking/fees/roads) per access point
- **Access point amenities** (restrooms, campground, outfitters)
- **Permit/land access notes** (if applicable)

### 6) Points of Interest (Curated)
- **Springs, bluffs, caves, swim holes, landmarks**
- Each POI links to map location and short description.

### 7) Community Notes (Optional for v1)
- **Warnings** (downed trees, closures)
- **Recent trip notes** (crowd level, clarity)
- Moderation / curation plan

---

## Category System (Core Labels)
### Conditions
- **Water Level (Stage)**
- **Flow (CFS)**
- **Trend** (rising/falling/steady)
- **Temperature** (if available later)

### Navigability
- **Navigable** / **Low** / **High** (status derived from gauge thresholds)
- **Expected drag** (if low)
- **Expected speed** (if high)

### Difficulty & Fit
- **Difficulty**: Beginner / Intermediate / Advanced
- **Trip length**: Short / Half-day / Full-day
- **Vessel suitability**: Tubing / Canoe / Kayak
- **Dog friendly** (Yes/No)
- **Family friendly** (Yes/No)

### Logistics
- **Shuttle time & distance**
- **Access fees** (if any)
- **Parking size** (limited/standard/large)

### Experience & POIs
- **Scenic** / **Swimming** / **Fishing** / **Wildlife**
- **Curated POIs** with tags

---

## Interaction Notes
- **Default focus:** Navigability + current level in the header.
- **Trip planning:** Always keep float time + shuttle time visible (sticky panel or summary card).
- **Vessel type affects speed:** allow selection (tubing, canoe, kayak) to update estimates.

---

## Data Requirements (MVP)
### River
- Name, slug, description
- Gauge station (USGS id)
- Navigability thresholds (low/normal/high ranges)
- Difficulty rating
- Default trip fit tags

### Access Point
- Name, type (put-in/take-out/both)
- Coordinates
- Amenities (parking, restrooms)
- Fees (if any)

### POI
- Name, type tag, coordinates, description
- Curated by admin

### Community Note
- Type (warning/info)
- Location (optional)
- Date
- Status (active/archived)

---

## MVP Priorities (Suggested Build Order)
1. River page shell + header with navigability emphasis
2. Planner panel (put-in/take-out + vessel type + estimates)
3. Conditions block (USGS level/flow + trend)
4. Curated POIs list + map pins
5. Community notes section (admin-curated initially)

---

## Open Questions (for refinement)
- Final wording for navigability statuses (e.g., “Low & Draggy” vs “Low / Not Ideal”).
- How to define tubing-friendly thresholds for each river.
- Whether to show a **single** “recommended float today” segment per river.
