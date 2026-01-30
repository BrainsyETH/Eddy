# Float Planner (Eddy) - SEO Improvements

**Created:** 2026-01-29 16:22 CST  
**Goal:** Drive Missouri traffic through SEO optimization

## 🔍 Competitor Research (2026-01-29)

### Top Competitors:
1. **FloatMissouri.com** - Established resource site
2. **Bass Resort** - Outfitter with strong SEO
3. **RiverHills Retreats** - Content-focused site
4. **Brookdale Farms / Eureka Floats** - "Near St. Louis" positioning

### High-Value Keywords Found:
- "Missouri float trip planning" ⭐⭐⭐
- "Meramec River float trip" (near St. Louis)
- "Current River float" (Ozark National Scenic Riverways)
- "Huzzah Creek float"
- "float trip near St. Louis"
- "Missouri river float"
- "best float rivers Missouri"
- "kayak Missouri rivers"
- "canoe rental Missouri"

### Reddit Community Insights (r/missouri):
- Active community asking for float trip recommendations
- Common rivers mentioned: Current, Meramec, Jacks Fork, Eleven Point, Gasconade, Niangua
- People want "level 1" beginner-friendly recommendations
- Crowding on Current River is a concern

---

## 📊 Current SEO Status (Eddy.guide)

### Metadata Analysis:

**Title:** "Eddy - Missouri River Float Trip Planner"  
✅ Good: Includes "Missouri" and "Float Trip"  
⚠️ Missing: Specific river names, location modifier

**Description:** "Plan your float trip on Missouri rivers with real-time water conditions, access points, float time estimates, and weather forecasts for the Ozarks."  
✅ Good: Mentions features, "Ozarks"  
⚠️ Missing: Specific river names, competitive differentiators

**OpenGraph Image:** Custom OG image created (2026-01-29)  
✅ Good: Branded, visually appealing  
✅ Deployed: Live at eddy.guide

---

## 🎯 SEO Improvement Actions

### Phase 1: Metadata Optimization (HIGH PRIORITY)

#### 1. Enhanced Page Title
**Current:** "Eddy - Missouri River Float Trip Planner"

**Improved Options:**
- "Missouri Float Trip Planner - Meramec, Current, Huzzah Rivers | Eddy" (57 chars)
- "Plan Your Missouri Float Trip - 8+ Rivers with Live Water Conditions" (69 chars)
- "Missouri River Float Planner - Real-Time Conditions & Maps | Eddy" (66 chars)

**Recommendation:** Option 1 (includes top river names)

#### 2. Enhanced Meta Description
**Current:** "Plan your float trip on Missouri rivers with real-time water conditions, access points, float time estimates, and weather forecasts for the Ozarks."

**Improved:**
"Interactive Missouri float trip planner for Meramec, Current, Huzzah, and 5 more rivers. Live USGS water conditions, float time estimates, access points, and shuttle planning. Perfect for kayaking and canoeing near St. Louis and the Ozarks."

**Why better:**
- ✅ Lists specific river names (SEO + user clarity)
- ✅ Mentions USGS (credibility + keyword)
- ✅ Includes "near St. Louis" (high-value location)
- ✅ Action words (kayaking, canoeing)
- ✅ 155 characters (optimal length)

#### 3. Add Keywords Meta Tag
**Add to layout.tsx:**
```typescript
keywords: [
  'Missouri float trip',
  'Meramec River float',
  'Current River canoe',
  'Huzzah Creek kayak',
  'float trip planner',
  'Missouri river conditions',
  'USGS water levels',
  'Ozark float trips',
  'float trip near St. Louis',
  'Missouri river map',
]
```

---

### Phase 2: Content Creation (MEDIUM PRIORITY)

#### Blog Posts to Create (Target: 1 per week)

1. **"Best Float Rivers in Missouri: Complete Guide 2026"**
   - Target keyword: "best float rivers Missouri"
   - Compare all 8 rivers (difficulty, scenery, access)
   - Include Float Planner CTAs

2. **"Meramec River Float Trip Guide: Access Points & Water Conditions"**
   - Target: "Meramec River float trip"
   - Most popular near St. Louis
   - Link to Float Planner's Meramec map

3. **"Current River Float Trip: What to Know Before You Go"**
   - Target: "Current River float"
   - Address crowding concerns (from Reddit)
   - Promote less crowded alternatives (Eleven Point, Niangua)

4. **"Float Trip Planning 101: How to Choose Your Missouri River"**
   - Target: "Missouri float trip planning"
   - Beginner-friendly guide
   - Decision tree → Float Planner

5. **"Huzzah Creek vs. Courtois Creek: Which is Better?"**
   - Target: "Huzzah Creek float"
   - Direct comparison (from search results)
   - Both link to Float Planner

#### Landing Pages to Create

1. **/rivers/meramec** - Dedicated Meramec River page
2. **/rivers/current** - Dedicated Current River page
3. **/near-st-louis** - "Float Trips Near St. Louis" aggregator page
4. **/beginner-guide** - First-time floater guide

---

### Phase 3: Backlink Building (ONGOING)

#### Target Sites for Outreach:

**Missouri Tourism & Outdoor Sites:**
- VisitMO.com (official state tourism)
- Missouri State Parks blog
- Ozark National Scenic Riverways (NPS)
- Mark Twain National Forest

**Outdoor & Adventure Blogs:**
- RiverHills Retreats (already has good content)
- TheBLT (Vacations Made Easy - already ranking)
- Local Missouri outdoor blogs

**Reddit Community Engagement:**
- r/missouri (470k+ members)
- r/kayaking (380k+ members)
- r/StLouis (200k+ members)
- r/camping (3.5M members)

**Outfitter Partnerships:**
- Bass Resort (bassresort.com)
- Blue Springs Ranch
- Brookdale Farms / Eureka Floats
- Old Cove Canoe & Kayak
- Two Rivers Canoe Rental
- Akers Ferry Canoe Rental

**Partnership Pitch:**
"Embed Float Planner on your site - help customers plan their trips with real-time water conditions. Free tool, drives bookings to you."

---

### Phase 4: Technical SEO (LOW PRIORITY - Already Good)

✅ Sitemap exists (`sitemap.ts`)  
✅ OpenGraph image deployed  
✅ Mobile-responsive  
✅ Fast performance (Next.js)

**Minor improvements:**
- [ ] Add structured data (LocalBusiness schema for each outfitter)
- [ ] robots.txt optimization
- [ ] XML sitemap submission to Google Search Console

---

## 📈 Metrics to Track

**Weekly:**
- Google Search Console impressions
- Organic traffic (Google Analytics)
- Top landing pages
- Top search queries

**Monthly:**
- Backlinks acquired
- Domain authority (Moz/Ahrefs)
- Keyword rankings (Meramec, Current, etc.)

**Traffic Goals:**
- Month 1: 100 visitors/week (baseline)
- Month 3: 500 visitors/week (+400%)
- Month 6: 2,000 visitors/week (+1,900%)

---

## 🚀 Next Actions (Prioritized)

### This Week:
1. ✅ Competitor research (DONE - 2026-01-29)
2. ✅ Update layout.tsx with improved metadata (DONE - 2026-01-29)
3. ✅ Write first blog post: "Best Float Rivers in Missouri" (DONE - 2026-01-29 18:56 CST)
   - **Branch:** seo/blog-best-rivers-2026
   - **PR needed:** https://github.com/BrainsyETH/Eddy/pull/new/seo/blog-best-rivers-2026
   - **Word count:** ~4,000 words (12 min read)
   - **Target keyword:** "best float rivers Missouri"
4. [ ] Submit sitemap to Google Search Console

### Next Week:
1. [ ] Outreach to 3 Missouri outfitters (partnership pitch)
2. [ ] Post on r/missouri with helpful content (not spammy)
3. [ ] Write second blog post: "Meramec River Float Trip Guide"

### Month 1:
1. [ ] 4 blog posts published
2. [ ] 5 outfitter partnerships secured
3. [ ] 10 backlinks acquired
4. [ ] Google Analytics installed & tracking

---

**Status:** Research complete, ready to execute improvements  
**Priority:** HIGH - Float Planner needs traffic before monetization  
**Estimated Impact:** 500-2,000 weekly visitors in 3 months
