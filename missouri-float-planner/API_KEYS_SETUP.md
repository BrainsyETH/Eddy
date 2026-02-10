# API Keys & Environment Variables Setup

This document lists all required API keys and environment variables for the Missouri Float Planner application.

## Required Environment Variables

### 1. Supabase (Required)

**Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Where to get them:**
1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **Settings** → **API**
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret!)

**Vercel Setup:**
- Add all three variables in Vercel project settings → Environment Variables
- Mark `SUPABASE_SERVICE_ROLE_KEY` as **sensitive** (not exposed to client)

---

### 2. Mapbox (Required for Drive Time)

**Variable:**
- `MAPBOX_ACCESS_TOKEN`

**Where to get it:**
1. Sign up at https://account.mapbox.com/
2. Go to **Account** → **Access tokens**
3. Use your **Default public token** or create a new one
4. For production, create a token with restricted scopes:
   - ✅ Directions API
   - ❌ Other APIs (optional, for security)

**Pricing:**
- Free tier: 100,000 requests/month
- $0.50 per 1,000 requests after that
- Drive time calculations are cached, so usage should be low

**Vercel Setup:**
- Add to Environment Variables
- Mark as **sensitive**

---

### 3. Map Tiles (Optional - Can use free alternatives)

**Variable:**
- `NEXT_PUBLIC_MAP_STYLE_URL`

**Options:**

#### Option A: MapTiler (Recommended - Free tier available)
1. Sign up at https://cloud.maptiler.com/
2. Go to **Maps** → **Streets**
3. Copy the **Style URL** (includes API key)
4. Example: `https://api.maptiler.com/maps/streets/style.json?key=YOUR_KEY`

**Pricing:**
- Free tier: 100,000 map loads/month
- $0.50 per 1,000 loads after that

#### Option B: MapLibre (Free, no key needed)
- Use OpenStreetMap tiles (no API key required)
- Set to: `https://demotiles.maplibre.org/style.json`
- Or use a self-hosted tile server

#### Option C: Mapbox (Requires Mapbox account)
- Use Mapbox styles (requires Mapbox token)
- Example: `mapbox://styles/mapbox/streets-v12`

**Vercel Setup:**
- Add to Environment Variables
- Can be public (starts with `NEXT_PUBLIC_`)

---

### 4. NPS API (Required for NPS Campground Sync)

**Variable:**
- `NPS_API_KEY`

**Where to get it:**
1. Sign up at https://www.nps.gov/subjects/developer/get-started.htm
2. Request an API key (instant approval)
3. Copy your API key

**Pricing:**
- Free — 1,000 requests per hour

**Vercel Setup:**
- Add to Environment Variables
- Mark as **sensitive**

---

### 5. RIDB / Recreation.gov (Required for USFS Campground Sync)

**Variable:**
- `RIDB_API_KEY`

**Where to get it:**
1. Go to https://ridb.recreation.gov
2. Create an account or sign in
3. Click your name (top right) to find your API key

**Pricing:**
- Free — 50 requests per minute

**Usage:**
- Used by the USFS sync cron (`/api/cron/sync-usfs`) to fetch campgrounds
  and recreation facilities near Missouri rivers from Recreation.gov
- Syncs USFS-managed campgrounds in Mark Twain National Forest

**Vercel Setup:**
- Add to Environment Variables
- Mark as **sensitive**

---

### 6. Cron Security (Required)

**Variable:**
- `CRON_SECRET`

**How to generate:**
```bash
# Generate a random secret
openssl rand -hex 32
```

Or use any random string generator (at least 32 characters recommended).

**Vercel Setup:**
- Add to Environment Variables
- Mark as **sensitive**
- This secures your cron endpoint from unauthorized access

---

### 7. Application URL (Required for Shareable Links)

**Variable:**
- `NEXT_PUBLIC_BASE_URL`

**Values:**
- **Development:** `http://localhost:3000`
- **Production:** Your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
- **Custom Domain:** Your custom domain (e.g., `https://floatplanner.com`)

**Vercel Setup:**
- Add to Environment Variables
- Can be public (starts with `NEXT_PUBLIC_`)

---

## Vercel Environment Variables Setup

### Step-by-Step:

1. **Go to your Vercel project**
   - Navigate to your project dashboard
   - Click **Settings** → **Environment Variables**

2. **Add each variable:**
   - Click **Add New**
   - Enter variable name
   - Enter variable value
   - Select environments (Production, Preview, Development)
   - For sensitive keys, toggle **Encrypt** (recommended)

3. **Required variables checklist:**
   - [ ] `NEXT_PUBLIC_SUPABASE_URL`
   - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - [ ] `SUPABASE_SERVICE_ROLE_KEY` (sensitive)
   - [ ] `MAPBOX_ACCESS_TOKEN` (sensitive)
   - [ ] `NEXT_PUBLIC_MAP_STYLE_URL`
   - [ ] `NPS_API_KEY` (sensitive)
   - [ ] `RIDB_API_KEY` (sensitive)
   - [ ] `CRON_SECRET` (sensitive)
   - [ ] `NEXT_PUBLIC_BASE_URL`

4. **Redeploy**
   - After adding variables, trigger a new deployment
   - Or wait for the next automatic deployment

---

## Local Development Setup

Create a `.env.local` file in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Mapbox
MAPBOX_ACCESS_TOKEN=pk.eyJ...

# Map Tiles
NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets/style.json?key=YOUR_KEY

# NPS API (campground sync)
NPS_API_KEY=your-nps-api-key

# RIDB / Recreation.gov (USFS campground sync)
RIDB_API_KEY=your-ridb-api-key

# Cron Security
CRON_SECRET=your-random-secret-here

# App URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Note:** Never commit `.env.local` to git (it's already in `.gitignore`)

---

## Cost Estimates

### Free Tier Limits:
- **Supabase:** Free tier includes 500MB database, 2GB bandwidth
- **Mapbox:** 100,000 requests/month free
- **MapTiler:** 100,000 map loads/month free
- **Vercel:** Free tier includes generous limits

### Expected Usage:
- Drive time API: ~10-50 requests/day (cached for 30 days)
- Map tiles: ~1,000-5,000 loads/month
- NPS sync: ~50 requests/week (Sunday cron)
- RIDB sync: ~50 requests/week (Sunday cron)
- **Total estimated cost: $0/month** (within free tiers)

---

## Testing API Keys

Once you've added the keys, test them:

1. **Supabase:** Check database connection in app
2. **Mapbox:** Test drive time calculation in `/api/plan`
3. **Map Tiles:** Verify map loads on homepage
4. **Cron:** Test gauge update endpoint (with auth header)

---

## Troubleshooting

### "MAPBOX_ACCESS_TOKEN not set"
- Verify the variable is added in Vercel
- Check it's not marked as "client-side only" if used in API routes
- Redeploy after adding

### "CRON_SECRET mismatch"
- Verify the secret in Vercel matches what's configured
- Check Vercel Cron configuration in `vercel.json`

### Map not loading
- Check `NEXT_PUBLIC_MAP_STYLE_URL` is correct
- Verify MapTiler/Mapbox key is valid
- Check browser console for CORS errors

---

## Security Notes

⚠️ **Never expose these in client-side code:**
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAPBOX_ACCESS_TOKEN` (if using in server-side only)
- `NPS_API_KEY`
- `RIDB_API_KEY`
- `CRON_SECRET`

✅ **Safe to expose (start with `NEXT_PUBLIC_`):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MAP_STYLE_URL`
- `NEXT_PUBLIC_BASE_URL`
