#!/usr/bin/env npx tsx
/**
 * Bulk Image Procurement for Access Points
 *
 * Searches Wikimedia Commons (by name + geo) and Mapbox Static API (satellite fallback)
 * for images of access points. Downloads, uploads to Vercel Blob, and updates the database.
 *
 * Usage:
 *   npx tsx scripts/fetch-images.ts                    # All access points
 *   npx tsx scripts/fetch-images.ts --dry-run          # Preview without uploading
 *   npx tsx scripts/fetch-images.ts --skip-existing    # Skip records that already have images
 *   npx tsx scripts/fetch-images.ts --river=current    # Single river only
 *   npx tsx scripts/fetch-images.ts --no-satellite     # Skip Mapbox satellite fallback
 *   npx tsx scripts/fetch-images.ts --max=5            # Process at most N access points
 */

import { loadEnvConfig } from '@next/env';
import { createAdminClient } from '../src/lib/supabase/admin';
import { put } from '@vercel/blob';

// Load environment variables from .env.local
loadEnvConfig(process.cwd());

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageCandidate {
  url: string;
  source: 'wikimedia' | 'mapbox';
  author: string;
  license: string;
  sourceUrl: string;
  width: number;
  height: number;
}

interface Attribution {
  url: string; // Vercel Blob URL after upload
  source: string;
  author: string;
  license: string;
  sourceUrl: string;
}

interface AccessPoint {
  id: string;
  name: string;
  slug: string;
  river_id: string | null;
  location_orig: { type: string; coordinates: [number, number] } | null;
  image_urls: string[] | null;
  image_attribution: Attribution[] | null;
  rivers: { name: string; slug: string } | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const WIKIMEDIA_DELAY_MS = 300; // Rate limit: be polite
const MAPBOX_DELAY_MS = 100;
const MAX_IMAGES_PER_POINT = 2;
const MIN_IMAGE_WIDTH = 400; // Skip tiny thumbnails

// Wikimedia license allowlist
const ALLOWED_LICENSES = new Set([
  'cc-by-sa-4.0', 'cc-by-sa-3.0', 'cc-by-sa-2.5', 'cc-by-sa-2.0',
  'cc-by-4.0', 'cc-by-3.0', 'cc-by-2.5', 'cc-by-2.0',
  'cc0', 'public domain', 'pd',
]);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const NO_SATELLITE = args.includes('--no-satellite');
const RIVER_FILTER = args.find(a => a.startsWith('--river='))?.split('=')[1] || null;
const MAX_POINTS = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '0', 10) || 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCoords(ap: AccessPoint): { lat: number; lng: number } | null {
  const geo = ap.location_orig;
  if (!geo || geo.type !== 'Point' || !Array.isArray(geo.coordinates) || geo.coordinates.length < 2) return null;
  return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
}

// ---------------------------------------------------------------------------
// Wikimedia Commons API
// ---------------------------------------------------------------------------

async function wikimediaGeoSearch(lat: number, lng: number, radius = 2000): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggslat: lat.toString(),
    ggslng: lng.toString(),
    ggsradius: Math.min(radius, 10000).toString(),
    ggsnamespace: '6', // File namespace
    ggslimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '1200',
    format: 'json',
    origin: '*',
  });
  const url = `${WIKIMEDIA_API}?${params}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'EddyFloatPlanner/1.0 (image-procurement script)' } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.query?.pages ? Object.keys(data.query.pages) : [];
  } catch {
    return [];
  }
}

async function wikimediaNameSearch(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '15',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '1200',
    format: 'json',
    origin: '*',
  });
  const url = `${WIKIMEDIA_API}?${params}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'EddyFloatPlanner/1.0 (image-procurement script)' } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.query?.pages ? Object.keys(data.query.pages) : [];
  } catch {
    return [];
  }
}

async function wikimediaGetImageInfo(pageIds: string[]): Promise<ImageCandidate[]> {
  if (pageIds.length === 0) return [];
  const params = new URLSearchParams({
    action: 'query',
    pageids: pageIds.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: '1200',
    format: 'json',
    origin: '*',
  });
  const url = `${WIKIMEDIA_API}?${params}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'EddyFloatPlanner/1.0 (image-procurement script)' } });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data.query?.pages || {};
    const candidates: ImageCandidate[] = [];

    for (const page of Object.values(pages) as any[]) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      // Only photos
      const mime = info.mime || '';
      if (!mime.startsWith('image/') || mime === 'image/svg+xml') continue;

      // Size filter
      const width = info.width || 0;
      const height = info.height || 0;
      if (width < MIN_IMAGE_WIDTH) continue;

      // License check
      const ext = info.extmetadata || {};
      const licenseRaw = (ext.LicenseShortName?.value || '').toLowerCase().trim();
      if (!isLicenseAllowed(licenseRaw)) continue;

      // Use the thumbnail URL (scaled to 1200px) if available, else original
      const imageUrl = info.thumburl || info.url;
      if (!imageUrl) continue;

      const author = stripHtml(ext.Artist?.value || 'Unknown');
      const sourceUrl = ext.DescriptionShortUrl?.value || page.title
        ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`
        : '';

      candidates.push({
        url: imageUrl,
        source: 'wikimedia',
        author,
        license: ext.LicenseShortName?.value || licenseRaw,
        sourceUrl,
        width,
        height,
      });
    }

    return candidates;
  } catch {
    return [];
  }
}

function isLicenseAllowed(license: string): boolean {
  const normalized = license.replace(/\s+/g, ' ').trim().toLowerCase();
  for (const allowed of ALLOWED_LICENSES) {
    if (normalized.includes(allowed)) return true;
  }
  if (normalized.includes('public domain')) return true;
  return false;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// ---------------------------------------------------------------------------
// Wikimedia search strategy for access points
// ---------------------------------------------------------------------------

async function searchWikimediaForAccessPoint(ap: AccessPoint): Promise<ImageCandidate[]> {
  const coords = getCoords(ap);
  const riverName = ap.rivers?.name || '';
  const allPageIds = new Set<string>();

  // 1. Geo search if we have coordinates
  if (coords) {
    const geoIds = await wikimediaGeoSearch(coords.lat, coords.lng, 2000);
    geoIds.forEach(id => allPageIds.add(id));
    await sleep(WIKIMEDIA_DELAY_MS);
  }

  // 2. Name search: "{access point name} {river name} Missouri"
  const nameQuery = `${ap.name} ${riverName} Missouri`;
  const nameIds = await wikimediaNameSearch(nameQuery);
  nameIds.forEach(id => allPageIds.add(id));
  await sleep(WIKIMEDIA_DELAY_MS);

  // 3. If access point name contains "spring", "cave", or "state park", search specifically
  const lowerName = ap.name.toLowerCase();
  if (lowerName.includes('spring') || lowerName.includes('cave') || lowerName.includes('state park')) {
    const specificIds = await wikimediaNameSearch(ap.name);
    specificIds.forEach(id => allPageIds.add(id));
    await sleep(WIKIMEDIA_DELAY_MS);
  }

  if (allPageIds.size === 0) return [];

  // Fetch image info for all candidates
  const candidates = await wikimediaGetImageInfo(Array.from(allPageIds));
  await sleep(WIKIMEDIA_DELAY_MS);

  // Sort by size (larger first), prefer landscape orientation
  candidates.sort((a, b) => {
    const aLandscape = a.width > a.height ? 1 : 0;
    const bLandscape = b.width > b.height ? 1 : 0;
    if (aLandscape !== bLandscape) return bLandscape - aLandscape;
    return (b.width * b.height) - (a.width * a.height);
  });

  return candidates.slice(0, MAX_IMAGES_PER_POINT);
}

// ---------------------------------------------------------------------------
// Mapbox Static API (satellite fallback)
// ---------------------------------------------------------------------------

function getMapboxSatelliteUrl(lat: number, lng: number): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error('MAPBOX_ACCESS_TOKEN not set');
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lng},${lat},14,0/600x400@2x?access_token=${token}`;
}

async function fetchMapboxSatellite(ap: AccessPoint): Promise<ImageCandidate | null> {
  const coords = getCoords(ap);
  if (!coords) return null;

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    console.warn('  ⚠ MAPBOX_ACCESS_TOKEN not set, skipping satellite fallback');
    return null;
  }

  const url = getMapboxSatelliteUrl(coords.lat, coords.lng);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return {
      url,
      source: 'mapbox',
      author: 'Mapbox / Maxar',
      license: 'Mapbox Terms of Service',
      sourceUrl: 'https://www.mapbox.com/about/maps/',
      width: 1200,
      height: 800,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Upload to Vercel Blob
// ---------------------------------------------------------------------------

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    // Skip if too small (likely an error page or icon)
    if (buffer.length < 5000) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

async function uploadToBlob(buffer: Buffer, contentType: string, name: string): Promise<string> {
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  const sanitized = name.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 60);
  const pathname = `access-points/${Date.now()}-${sanitized}${ext}`;

  const blob = await put(pathname, buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType,
  });

  return blob.url;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🖼️  Eddy Image Procurement');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Skip existing: ${SKIP_EXISTING}`);
  console.log(`   Satellite fallback: ${!NO_SATELLITE}`);
  if (RIVER_FILTER) console.log(`   River filter: ${RIVER_FILTER}`);
  if (MAX_POINTS) console.log(`   Max points: ${MAX_POINTS}`);
  console.log();

  const supabase = createAdminClient();

  // Fetch access points with river info
  let query = supabase
    .from('access_points')
    .select('id, name, slug, river_id, location_orig, image_urls, image_attribution, rivers(name, slug)')
    .eq('approved', true)
    .order('river_id')
    .order('river_mile_downstream');

  if (RIVER_FILTER) {
    // Look up river ID by slug
    const { data: river } = await supabase
      .from('rivers')
      .select('id')
      .eq('slug', RIVER_FILTER)
      .single();
    if (!river) {
      console.error(`❌ River "${RIVER_FILTER}" not found`);
      process.exit(1);
    }
    query = query.eq('river_id', river.id);
  }

  const { data: accessPoints, error } = await query;
  if (error) {
    console.error('❌ Failed to fetch access points:', error.message);
    process.exit(1);
  }

  let points = (accessPoints || []) as unknown as AccessPoint[];

  if (SKIP_EXISTING) {
    const before = points.length;
    points = points.filter(ap => !ap.image_urls || ap.image_urls.length === 0);
    console.log(`   Filtered: ${before} total → ${points.length} without images`);
  }

  if (MAX_POINTS && points.length > MAX_POINTS) {
    points = points.slice(0, MAX_POINTS);
    console.log(`   Limited to first ${MAX_POINTS} access points`);
  }

  console.log(`\n📍 Processing ${points.length} access points...\n`);

  // Stats
  let wikimediaFound = 0;
  let satelliteUsed = 0;
  let noImages = 0;
  let uploaded = 0;
  let errors = 0;

  for (let i = 0; i < points.length; i++) {
    const ap = points[i];
    const riverName = ap.rivers?.name || 'Unknown River';
    const coords = getCoords(ap);
    const coordStr = coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'no coords';
    console.log(`[${i + 1}/${points.length}] ${ap.name} (${riverName}) — ${coordStr}`);

    try {
      // Search Wikimedia Commons
      const candidates = await searchWikimediaForAccessPoint(ap);

      if (candidates.length > 0) {
        console.log(`  ✅ Wikimedia: ${candidates.length} image(s) found`);
        wikimediaFound++;

        if (!DRY_RUN) {
          const newUrls: string[] = [...(ap.image_urls || [])];
          const newAttribution: Attribution[] = [...(ap.image_attribution as Attribution[] || [])];

          for (const candidate of candidates) {
            const downloaded = await downloadImage(candidate.url);
            if (!downloaded) {
              console.log(`  ⚠ Failed to download: ${candidate.url.substring(0, 80)}...`);
              continue;
            }

            const blobUrl = await uploadToBlob(downloaded.buffer, downloaded.contentType, ap.slug);
            newUrls.push(blobUrl);
            newAttribution.push({
              url: blobUrl,
              source: candidate.source,
              author: candidate.author,
              license: candidate.license,
              sourceUrl: candidate.sourceUrl,
            });
            uploaded++;
            console.log(`  📤 Uploaded: ${blobUrl.substring(0, 70)}...`);
          }

          // Update database
          const { error: updateErr } = await supabase
            .from('access_points')
            .update({ image_urls: newUrls, image_attribution: newAttribution })
            .eq('id', ap.id);

          if (updateErr) {
            console.log(`  ❌ DB update failed: ${updateErr.message}`);
            errors++;
          }
        } else {
          for (const c of candidates) {
            console.log(`  → ${c.license} by ${c.author} (${c.width}x${c.height})`);
            console.log(`    ${c.url.substring(0, 100)}`);
          }
        }
      } else if (!NO_SATELLITE) {
        // Mapbox satellite fallback
        console.log('  ⚪ No Wikimedia results, trying satellite...');
        const satellite = await fetchMapboxSatellite(ap);
        await sleep(MAPBOX_DELAY_MS);

        if (satellite) {
          satelliteUsed++;
          console.log('  🛰️  Satellite image available');

          if (!DRY_RUN) {
            const downloaded = await downloadImage(satellite.url);
            if (downloaded) {
              const blobUrl = await uploadToBlob(downloaded.buffer, downloaded.contentType, `${ap.slug}-satellite`);
              const newUrls = [...(ap.image_urls || []), blobUrl];
              const newAttribution = [
                ...(ap.image_attribution as Attribution[] || []),
                {
                  url: blobUrl,
                  source: satellite.source,
                  author: satellite.author,
                  license: satellite.license,
                  sourceUrl: satellite.sourceUrl,
                },
              ];

              const { error: updateErr } = await supabase
                .from('access_points')
                .update({ image_urls: newUrls, image_attribution: newAttribution })
                .eq('id', ap.id);

              if (updateErr) {
                console.log(`  ❌ DB update failed: ${updateErr.message}`);
                errors++;
              } else {
                uploaded++;
                console.log(`  📤 Uploaded satellite: ${blobUrl.substring(0, 70)}...`);
              }
            }
          }
        } else {
          noImages++;
          console.log('  ⚠ No images found');
        }
      } else {
        noImages++;
        console.log('  ⚠ No images found (satellite disabled)');
      }
    } catch (err) {
      errors++;
      console.log(`  ❌ Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  console.log(`   Access points processed: ${points.length}`);
  console.log(`   Wikimedia matches:       ${wikimediaFound}`);
  console.log(`   Satellite fallbacks:     ${satelliteUsed}`);
  console.log(`   No images found:         ${noImages}`);
  if (!DRY_RUN) {
    console.log(`   Images uploaded:         ${uploaded}`);
  }
  if (errors > 0) {
    console.log(`   Errors:                  ${errors}`);
  }
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
