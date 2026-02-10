# USFS & USACE Data Integration Plan

## Overview

This document outlines how to integrate U.S. Forest Service (USFS) campground, POI, and
access point data into Eddy, plus supplementary USACE data for Missouri rivers. The focus
is on enriching existing Missouri river data - particularly rivers that flow through
Mark Twain National Forest.

---

## Current State

### What Eddy Already Has
- **8 Missouri rivers** with USGS gauge integration, NHD geometry, and access points
- **NPS API sync** for Ozark National Scenic Riverways (Current, Jacks Fork, Eleven Point)
- **managing_agency = 'USFS'** already in schema and admin UI
- **Some USFS data** already exists (Berryman Campground, Eleven Point USFS accesses)

### Where USFS Data Fills Gaps

| River | USFS Coverage | Current Gap |
|-------|--------------|-------------|
| Eleven Point | Extensive - Wild & Scenic River, USFS manages most access | Some accesses lack full amenity details |
| Big Piney | Flows through Mark Twain NF | Missing USFS campgrounds/accesses entirely |
| Current River (upper) | Bagamaw Bay, Deer Leap, Float Camp in MTNF | Listed as text overrides, not proper USFS records |
| Courtois Creek | Berryman area is USFS | Only Berryman Campground tagged |
| Huzzah Creek | Adjacent USFS land | No USFS data |
| Meramec (upper) | Some MTNF boundary overlap | No USFS data |
| Niangua | Limited USFS overlap | Low priority |
| Jacks Fork | Mostly NPS (ONSR) | NPS covers this well |

---

## Data Sources

### 1. RIDB API (Recreation Information Database) - PRIMARY

**Base URL:** `https://ridb.recreation.gov/api/v1`
**Auth:** API key required (free, sign up at ridb.recreation.gov)
**Rate Limit:** 50 requests/minute
**Docs:** https://ridb.recreation.gov/docs

This is the same data that powers Recreation.gov. Mark Twain National Forest has
14 campgrounds and 2 permits listed.

#### Key Endpoints

```
GET /recareas
  ?query=Mark+Twain+National+Forest
  &state=MO
  &activity=CAMPING

GET /recareas/{recAreaId}/facilities
  # Returns all facilities within a rec area

GET /facilities
  ?state=MO
  &activity=CAMPING
  &latitude=36.99&longitude=-91.01&radius=25
  # Proximity search (great for finding facilities near a river)

GET /facilities/{facilityId}
  # Detailed facility info

GET /facilities/{facilityId}/campsites
  # Individual campsite details (hookups, max vehicle length, etc.)

GET /facilities/{facilityId}/media
  # Photos and documents
```

#### Data Fields Available

**RecArea (Recreation Area):**
- RecAreaID, RecAreaName, RecAreaDescription
- RecAreaLatitude, RecAreaLongitude
- RecAreaPhone, RecAreaEmail
- RecAreaReservationURL, RecAreaMapURL
- StayLimit, RecAreaFeeDescription
- Keywords, LastUpdatedDate
- Activities[] (with ActivityID, ActivityName)

**Facility:**
- FacilityID, FacilityName, FacilityDescription
- FacilityLatitude, FacilityLongitude
- FacilityPhone, FacilityEmail
- FacilityReservationURL, FacilityMapURL
- FacilityTypeDescription (Campground, Day Use Area, Trailhead, etc.)
- FacilityUseFeeDescription
- FacilityDirections
- StayLimit, Reservable (bool)
- Keywords, LastUpdatedDate
- Activities[], Media[], Addresses[], Links[]

**Campsite:**
- CampsiteID, CampsiteName, CampsiteType
- Loop, TypeOfUse (Overnight, Day)
- MaxNumOfPeople, MinNumOfPeople
- MaxVehicles, MaxVehicleLength
- CampsiteAccessible (bool), CampsiteReservable (bool)
- CampsiteLongitude, CampsiteLatitude
- CreatedDate, LastUpdatedDate
- Attributes[] (key-value pairs for amenities like "Electric Hookup", "Water Hookup", etc.)
- PermittedEquipment[] (tent, RV sizes, etc.)

#### Mark Twain National Forest - Known Facilities on Recreation.gov

Gateway ID: `1086` (https://www.recreation.gov/camping/gateways/1086)

Known campgrounds (14 listed):
- Cobb Ridge
- Council Bluff Recreation Area
- Greer Crossing Recreation Area (Eleven Point)
- Lane Spring Recreation Area (Big Piney area)
- Marble Creek Recreation Area
- McCormack Lake Recreation Area
- Berryman Trail Campground (Courtois Creek)
- Red Bluff Recreation Area (Current River area)
- Sutton Bluff Recreation Area
- Loggers Lake
- Fourche Lake
- Silver Mines Recreation Area
- Markham Spring Recreation Area
- Pinewoods Lake Recreation Area

---

### 2. USFS ArcGIS REST Services - SUPPLEMENTARY

**Base URLs:**
- Recreation Sites: `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0`
- Recreation Sites INFRA: `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0`
- Recreation Activities: `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationAreaActivities_01/MapServer/0`

**Auth:** None required (public ArcGIS services)
**Format:** JSON/GeoJSON via `?f=json` or `?f=geojson`

#### Query Pattern

```
GET .../MapServer/0/query
  ?where=RECAREANAME LIKE '%Mark Twain%' AND RECAREATYPE = 'Campground'
  &outFields=*
  &outSR=4326
  &f=geojson
  &resultRecordCount=100
```

**Advantages over RIDB:**
- No API key needed
- GeoJSON output with coordinates (spatial queries)
- Updated nightly from USFS internal systems
- Includes sites NOT on Recreation.gov (dispersed camping, informal accesses)

**Disadvantages:**
- Less detailed amenity data than RIDB
- Schema can change without notice
- Service reliability varies

#### Key Fields (Recreation Sites INFRA)

- SITE_NAME, SITE_TYPE
- LATITUDE, LONGITUDE (geometry)
- FORESTNAME, DISTRICTNAME
- OPEN_SEASON_START, OPEN_SEASON_END
- FEE (boolean), ACCESSIBLE (boolean)
- RESERVABLE (boolean)
- RECAREANAME, RECAREAURL

#### Key Fields (Recreation Opportunities)

- RECAREAID, RECAREANAME, RECAREADESCRIPTION
- RECAREALATITUDE, RECAREALONGITUDE
- RECAREASTATUS, RECAREATYPE
- RECAREADIRECTIONS, RECAREAFEEDESCRIPTION
- RECAREASTAYLIMIT
- FORESTORGCODE, DISTRICTORGCODE

---

### 3. USACE CWMS Data API - FOR FLOW DATA ENRICHMENT

**Base URL:** `https://cwms-data.usace.army.mil/cwms-data/`
**Swagger:** https://cwms-data.usace.army.mil/cwms-data/swagger-ui.html
**Auth:** None required for read access
**npm:** `cwmsjs` (TypeScript client)

#### Relevance to Missouri Rivers

The MVS (St. Louis) district manages some water infrastructure affecting Ozark rivers.
While USGS is the primary flow data source, CWMS can provide:

- Supplementary gauge data for Corps-managed locations
- Dam release information if any Corps structures affect these rivers
- Historical flood data

#### Discovery Query

```
GET /catalog/TIMESERIES
  ?office=MVS
  &like=*Eleven Point*
```

**Priority:** LOW for Missouri Ozark rivers (USGS already covers these well).
Higher priority if/when expanding to dam-controlled rivers.

---

## Integration Architecture

### New File: `src/lib/usfs/ridb.ts`

RIDB client mirroring the pattern of the existing NPS client:

```typescript
// Key exports:
export async function fetchRecAreas(state: string): Promise<RecArea[]>
export async function fetchFacilities(recAreaId: string): Promise<Facility[]>
export async function fetchFacilitiesByProximity(
  lat: number,
  lng: number,
  radius: number // miles
): Promise<Facility[]>
export async function fetchCampsites(facilityId: string): Promise<Campsite[]>
```

### New File: `src/lib/usfs/sync.ts`

Sync service mirroring `src/lib/nps/sync.ts`:

```typescript
// Key functions:
export async function syncUSFSCampgrounds(): Promise<SyncResult>
  // 1. Fetch MTNF facilities from RIDB
  // 2. Filter to campgrounds within proximity of our 8 rivers
  // 3. Upsert into access_points with managing_agency = 'USFS'
  // 4. Match to existing access points by name/proximity (like NPS sync)
  // 5. Store detailed amenity data

export async function syncUSFSPOIs(): Promise<SyncResult>
  // 1. Fetch rec areas and day-use facilities
  // 2. Filter to those near our rivers
  // 3. Upsert into points_of_interest table
```

### New Cron: `src/app/api/cron/sync-usfs/route.ts`

Weekly sync (USFS data changes less frequently than NPS):

```typescript
export async function GET(request: Request) {
  // Verify CRON_SECRET
  // Run syncUSFSCampgrounds()
  // Run syncUSFSPOIs()
  // Return results
}
```

### Database Changes

**Option A: Extend existing tables (recommended)**
- Add `ridb_facility_id` column to `access_points` (like `nps_campground_id`)
- Add `ridb_rec_area_id` column to `points_of_interest`
- Store RIDB-specific amenity data in existing JSONB fields

**Option B: Create parallel USFS table**
- Create `usfs_recreation_sites` table (like `nps_campgrounds`)
- Link to access_points via FK
- More data but more complexity

### Environment Variables

```
RIDB_API_KEY=<your-recreation-gov-api-key>
```

---

## Mapping: RIDB Data to Eddy Schema

### Facility -> access_points

| RIDB Field | Eddy Field | Notes |
|---|---|---|
| FacilityName | name | |
| FacilityLatitude/Longitude | location_orig | |
| (snap to river) | location_snap | Via snap_to_river() RPC |
| FacilityTypeDescription | type | Map: "Campground" -> campground |
| "USFS" | managing_agency | Hardcoded |
| FacilityReservationURL | official_site_url | |
| FacilityUseFeeDescription | fee_notes | |
| (has fee) | fee_required | |
| FacilityDescription | description | |
| FacilityDirections | directions_override | If useful |
| StayLimit | (local_tips) | Include in tips |

### Campsite attributes -> amenities[]

Map RIDB campsite attributes to the existing amenities array:
- "Toilet" -> "vault_toilet" or "flush_toilet"
- "Water" -> "potable_water"
- "Electric Hookup" -> "electric"
- "Picnic Table" -> "picnic_tables"
- etc.

### RecArea -> points_of_interest

| RIDB Field | Eddy Field | Notes |
|---|---|---|
| RecAreaName | name | |
| RecAreaLatitude/Longitude | location | |
| RecAreaDescription | description | |
| "other" | poi_type | Or map from Activities[] |
| RecAreaID | (ridb_rec_area_id) | New field |

---

## Implementation Phases

### Phase 1: RIDB Campground Sync (Priority: HIGH)
1. Sign up for RIDB API key
2. Create `src/lib/usfs/ridb.ts` client
3. Create `src/lib/usfs/sync.ts` with campground sync
4. Add `ridb_facility_id` to access_points migration
5. Create cron endpoint for periodic sync
6. Test with Mark Twain NF campgrounds near Eleven Point and Big Piney

### Phase 2: USFS Access Point Enrichment (Priority: MEDIUM)
1. Query RIDB for non-campground facilities (boat ramps, trailheads, day use)
2. Match against existing access points by proximity
3. Enrich with RIDB data (fees, directions, amenities, URLs)
4. Fix Current River MTNF accesses (Bagamaw Bay, Deer Leap, Float Camp)

### Phase 3: POI Expansion (Priority: MEDIUM)
1. Sync USFS recreation areas as POIs (springs, scenic areas, trails)
2. Add to points_of_interest with USFS source tracking
3. Consider ArcGIS REST fallback for sites not on Recreation.gov

### Phase 4: ArcGIS Supplementary Data (Priority: LOW)
1. Use USFS ArcGIS services for dispersed camping areas
2. Pull trail data for riverside hiking
3. Forest boundary data for map overlays

---

## Environment & Config Additions

### API Keys Required
- **RIDB_API_KEY**: Free, sign up at https://ridb.recreation.gov
  (Add to `.env.local` and `API_KEYS_SETUP.md`)

### Mark Twain National Forest Reference IDs
- **Recreation.gov Gateway ID:** 1086
- **RIDB RecArea ID:** TBD (query RIDB API to discover)
- **Forest Org Code:** 0901 (Mark Twain NF)
- **ArcGIS Forest Name:** "Mark Twain National Forest"

### Rivers -> MTNF Ranger Districts

| River | Nearest Ranger District | Notes |
|-------|------------------------|-------|
| Eleven Point | Eleven Point Ranger District | Primary USFS river |
| Big Piney | Houston/Rolla Ranger District | Flows through MTNF |
| Current (upper) | Salem Ranger District | Bagamaw Bay, Deer Leap areas |
| Courtois | Potosi Ranger District | Berryman area |
| Huzzah | Potosi Ranger District | Adjacent MTNF land |
| Meramec (upper) | Salem/Potosi | Some boundary overlap |

---

## References

- RIDB API Docs: https://ridb.recreation.gov/docs
- Recreation.gov Data Sharing: https://www.recreation.gov/use-our-data
- Mark Twain NF on Recreation.gov: https://www.recreation.gov/camping/gateways/1086
- USFS Open Data Portal: https://data-usfs.hub.arcgis.com/
- USFS Recreation Sites INFRA: https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0
- USFS Recreation Opportunities: https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0
- CWMS Data API: https://cwms-data.usace.army.mil/cwms-data/swagger-ui.html
- CWMS JS Client: https://www.npmjs.com/package/cwmsjs
- USACE Access to Water: https://water.usace.army.mil/
