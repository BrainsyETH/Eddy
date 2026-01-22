# Missouri Float Planner

A web application for planning float trips on Missouri rivers. Select put-in and take-out points on an interactive map, and get estimates for river distance, float time, and drive-back shuttle time based on real-time water conditions.

## Features

- **Interactive Map**: Click to select put-in and take-out points
- **Real-time Conditions**: Live USGS gauge data with floatability ratings
- **Float Time Estimates**: Calculated based on vessel type and water levels
- **Shuttle Planning**: Drive-back time and distance
- **Shareable Plans**: Generate URLs to share your float plan

## Supported Rivers

1. Meramec River
2. Current River
3. Eleven Point River
4. Jacks Fork River
5. Niangua River
6. Big Piney River
7. Huzzah Creek
8. Courtois Creek

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, MapLibre GL JS
- **Backend**: Supabase (PostgreSQL + PostGIS)
- **APIs**: USGS Water Services, Mapbox Directions

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase CLI (for local development)
- A Supabase project

### Environment Setup

Create a `.env.local` file with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Mapbox (for driving directions)
MAPBOX_ACCESS_TOKEN=your_mapbox_token

# Map Tiles
NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets/style.json?key=YOUR_KEY

# Cron Security
CRON_SECRET=your_random_secret

# App URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Database Setup

1. **Run migrations** in your Supabase project:

```bash
# Using Supabase CLI
supabase db push

# Or run migrations manually in SQL Editor
```

2. **Seed the database** with river data:

```bash
# Run each seed file in order via Supabase SQL Editor:
# 1. supabase/seed/rivers.sql
# 2. supabase/seed/gauge_stations.sql
# 3. supabase/seed/access_points.sql

# Or use Supabase CLI:
supabase db reset  # This runs migrations + seed.sql
```

3. **Verify data import**:

```sql
SELECT name, length_miles FROM rivers ORDER BY name;
SELECT COUNT(*) FROM access_points WHERE approved = true;
SELECT COUNT(*) FROM gauge_stations WHERE active = true;
```

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Data Pipeline Scripts

Located in `/scripts`:

| Script | Purpose |
|--------|---------|
| `import-nhd-rivers.ts` | Downloads river geometry from NHD |
| `fetch-gauge-stations.ts` | Imports USGS gauge stations |
| `snap-access-points.ts` | Snaps access points to river lines |

Run scripts with:

```bash
npm run db:import-rivers
npm run db:import-gauges
npm run db:snap-access-points
```

## Project Structure

```
missouri-float-planner/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities and clients
│   ├── hooks/            # React hooks
│   ├── types/            # TypeScript types
│   └── constants/        # App constants
├── supabase/
│   ├── migrations/       # Database migrations
│   └── seed/             # Seed data SQL files
├── scripts/              # Data import scripts
└── public/               # Static assets
```

## Development Phases

- [x] **Phase 1**: Foundation - Project setup, database, basic API
- [x] **Phase 2**: Data Pipeline - River import, gauge stations, access points
- [ ] **Phase 3**: Core API - Float plan calculation, conditions
- [ ] **Phase 4**: Frontend Map - Interactive map interface
- [ ] **Phase 5**: Plan Display - Summary, sharing
- [ ] **Phase 6**: Admin & Polish - Admin panel, final testing

## License

Private project - not for distribution.
