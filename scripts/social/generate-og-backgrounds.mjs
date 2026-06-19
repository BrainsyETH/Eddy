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

const { OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN, SUPABASE_URL, SUPABASE_KEY } = process.env;
for (const [k, v] of Object.entries({ OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN, SUPABASE_URL, SUPABASE_KEY })) {
  if (!v) {
    console.error(`Missing required env var: ${k}`);
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

// Per-key subject. River keys must match rivers.slug; plus two specials.
const SUBJECTS = {
  current: 'The Current River: deep, clear, spring-fed blue-green water below tall dolomite bluffs.',
  'jacks-fork': 'The Jacks Fork: a narrow, wild spring-branch winding between high bluffs.',
  meramec: 'The Meramec River: a wide gravel-bar river with caves and limestone bluffs.',
  'eleven-point': 'The Eleven Point: a remote, forested, spring-fed river.',
  niangua: 'The Niangua River: rolling Ozark hills and clear spring water.',
  'big-piney': 'The Big Piney: a clear, rocky, forested Ozark river.',
  huzzah: 'Huzzah Creek: a small, clear Ozark creek over gravel bars, lined with pine.',
  courtois: 'Courtois Creek: a small, clear Ozark creek beneath bluffs.',
  // Specials
  forecast:
    'A bright, optimistic Ozark weekend mood: clear warm sky and sun glinting on calm blue water — inviting and upbeat (still deep-green poster style).',
  danger:
    'A tense caution mood: high, fast, churning swollen water under a dark stormy sky, deeper shadows, and a stronger amber-to-red warning accent (still NO text, still on-brand deep teal).',
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
