#!/usr/bin/env node
// Generate + cache AI cover backgrounds for the social OG covers.
//
// One image per key — each river slug, plus 'forecast' and 'danger' — generated
// with OpenAI gpt-image-1, uploaded to Vercel Blob, and upserted into
// og_backgrounds(key, url, prompt). The OG route reads these and paints the live
// text on top, so OpenAI is hit ONLY here (generate-once + cache), never per
// render. Idempotent: re-running a key overwrites its row with a fresh image.
//
// Env: OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN, SUPABASE_URL, SUPABASE_KEY.
// Run:   node scripts/social/generate-og-backgrounds.mjs            # all keys
//        node scripts/social/generate-og-backgrounds.mjs danger current
//
// No npm deps — uses Node 20+ global fetch + Buffer.

import { readFileSync, existsSync } from 'node:fs';

// Convenience: auto-load the app's .env.local (or .env) so you can run this from
// the repo root without re-exporting secrets. Already-set process.env wins. Also
// accepts the Next-style names (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
for (const p of ['missouri-float-planner/.env.local', 'missouri-float-planner/.env', '.env.local', '.env']) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
  console.log(`Loaded env from ${p}`);
  break;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [k, v] of Object.entries({ OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN, SUPABASE_URL, SUPABASE_KEY })) {
  if (!v) {
    console.error(`Missing required env var: ${k} (set it, or add it to missouri-float-planner/.env.local)`);
    process.exit(1);
  }
}

// Shared brand-poster style. NB: the model must NOT render text — our OG route
// overlays the real, dynamic title — and must keep the LEFT + TOP open so the
// title has room.
const BASE_STYLE = [
  'Flat editorial vector-illustration poster background. ABSOLUTELY NO text, letters, words, numbers, captions, labels, or logos anywhere.',
  'Deep river-green base (#0d2a2c to #1A3D40) with a giant faint ghosted topographic contour-line map filling the whole canvas.',
  'A single bright blue Ozark river winds through the scene, weighted to the RIGHT third of the frame.',
  'Ozark nature: limestone bluffs, pine and oak forest, gravel bars.',
  'Small warm-orange accents only, as tiny sparse details. Subtle paper-grain texture across everything.',
  'The LEFT two-thirds and the TOP are calm, open, near-empty negative space (for a text overlay added later).',
  'Muted, sophisticated, modern outdoor-brand look. Portrait 2:3 composition.',
].join(' ');

// Per-key subject. River keys must match rivers.slug; plus two specials. Each
// line adds a SIGNATURE feature + its own lighting/palette so the eight rivers
// read as a varied set, not near-duplicates, while sharing BASE_STYLE.
const SUBJECTS = {
  current:
    'The Current River — towering blue-grey dolomite bluffs above deep aqua spring-fed water, with a turquoise spring boil. Cool blue palette, bright midday light.',
  'jacks-fork':
    'The Jacks Fork — a tight, narrow canyon where sheer vertical bluffs hug a slim winding river. Dramatic and shadowed, deep greens.',
  meramec:
    'The Meramec River — a wide river bend with a dark cave mouth set into the limestone bluff and broad pale gravel bars. Warmer, earthy tones.',
  'eleven-point':
    'The Eleven Point — remote and quiet, soft fog drifting over a forested spring-fed river with few bluffs. Muted palette, soft dawn light.',
  niangua:
    'The Niangua River — gentle rolling Ozark hills and a clear spring pool, pastoral and open. Brighter green under an open sky.',
  'big-piney':
    'The Big Piney — rocky riffles and pine-ridge hills, a clear shallow run tumbling over stone. Crisp, fresh greens.',
  huzzah:
    'Huzzah Creek — an intimate small creek with a close-up gravel bar and overhanging sycamores. Cozy, low-angle, warm.',
  courtois:
    'Courtois Creek — a small creek tucked beneath a sheltering limestone bluff, with a touch of autumn orange in the trees.',
  // Specials
  forecast:
    'The brightest, most inviting scene of the set — warm golden-sunrise light over glassy calm blue water, clear sky, luminous and optimistic (still the deep-green poster style).',
  danger:
    'A high-water DANGER mood — a swollen, fast, churning river with whitecaps and submerged gravel bars under a dark, turbulent storm sky with bruised clouds; deep shadows and a strong amber-to-red warning glow. Tense and urgent. Keep the top and left open. Still NO text.',
};

const SIZE = '1024x1536'; // portrait; OG route cover-crops to 9:16 + 1:1
const QUALITY = 'high';

async function generateImage(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: SIZE, quality: QUALITY, n: 1 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI response had no image data');
  return Buffer.from(b64, 'base64');
}

async function uploadToBlob(key, bytes) {
  const res = await fetch(`https://blob.vercel-storage.com/og-backgrounds/${key}.png`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${BLOB_READ_WRITE_TOKEN}`,
      'x-content-type': 'image/png',
      'x-cache-control-max-age': '31536000',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Blob ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  if (!json.url) throw new Error('Blob upload returned no url');
  return json.url;
}

async function upsertRow(key, url, prompt) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/og_backgrounds`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, url, prompt, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const requested = process.argv.slice(2);
const keys = requested.length ? requested : Object.keys(SUBJECTS);

let ok = 0;
let failed = 0;
for (const key of keys) {
  const subject = SUBJECTS[key];
  if (!subject) {
    console.error(`✗ ${key}: unknown key (no subject defined) — skipping`);
    failed++;
    continue;
  }
  const prompt = `${BASE_STYLE} ${subject}`;
  try {
    console.log(`→ ${key}: generating…`);
    const bytes = await generateImage(prompt);
    const url = await uploadToBlob(key, bytes);
    await upsertRow(key, url, prompt);
    console.log(`✓ ${key}: ${url}`);
    ok++;
  } catch (e) {
    console.error(`✗ ${key}: ${e.message}`);
    failed++;
  }
}

console.log(`\nDone. ${ok} generated, ${failed} failed.`);
process.exit(failed > 0 && ok === 0 ? 1 : 0);
