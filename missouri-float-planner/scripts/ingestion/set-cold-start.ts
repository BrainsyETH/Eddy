#!/usr/bin/env npx tsx
/**
 * Cold-start metadata for the 4 new rivers (Elk, James, North Fork, Spring).
 * Sets float_summary + float_tip (the "Eddy Says" conditions/safety prose) and
 * fills weather_lat/lon where the dossier left them null. Idempotent: safe to
 * re-run. Does NOT touch `active` (activation is a separate, later step).
 *
 * Prose is written from the finalized dossier thresholds:
 *   elk  07189000 [ft]  too_low 2.5 / optimal 3.5-5 / dangerous 6
 *   james 07052500 [cfs] optimal 180-937 / high 3079 / dangerous 4410 ; Boaz 07052250 opt_min 150
 *   north-fork-white 07057500 [cfs] optimal 282-811 / high 1000 / dangerous 8440
 *   spring-river 07069305 [cfs] optimal 206-694 (no dangerous anchor — prose avoids a number)
 */
import { createAdminClient } from '../../src/lib/supabase/admin';

interface Meta {
  slug: string;
  float_summary: string;
  float_tip: string;
  weather_lat?: number;
  weather_lon?: number;
}

const META: Meta[] = [
  {
    slug: 'elk',
    float_summary:
      "At the Tiff City gauge (primary), 3.5–5.0 ft is the ideal float range. " +
      "Below 2.5 ft the Elk gets shallow and you'll drag over its wide gravel bars. " +
      "Above 6.0 ft it runs high and pushy—we recommend another day. " +
      "The Elk is a warm, gravelly southwest-Missouri river that rises fast after storms.",
    float_tip:
      "The Elk is flashy—it rises hard and fast after heavy rain, especially below the " +
      "Big Sugar/Indian Creek confluences. Check the gauge trend before you launch and " +
      "postpone if it's rising or rain is in the forecast.",
    weather_lat: 36.5951,
    weather_lon: -94.3833, // Pineville, MO
  },
  {
    slug: 'james',
    float_summary:
      "At the Galena gauge (primary), 180–937 cfs is the ideal range for the classic " +
      "Hootentown-to-Galena float. Above ~3,079 cfs the James runs high and fast; " +
      "4,410 cfs and up is dangerous—choose another day. On the upper river near " +
      "Springfield (Boaz gauge), you'll want at least ~150 cfs to avoid dragging.",
    float_tip:
      "The upper James above Galena drops quickly in summer. In low water, put in at " +
      "Hootentown rather than farther upstream, and watch for the low-head dam near Kissick—portage it.",
    // james already has weather_lat/lon (Galena) — left unchanged
  },
  {
    slug: 'north-fork-white',
    float_summary:
      "At the Tecumseh gauge (primary), 282–811 cfs is the ideal float range. " +
      "Above ~1,000 cfs the North Fork runs high and cold; it becomes dangerous near " +
      "8,440 cfs. Spring-fed baseflow from Rainbow and Blue Springs keeps it floatable " +
      "most of the year, but it can jump quickly after heavy rain.",
    float_tip:
      "Scout or portage The Falls (a ledge drop in front of River of Life Farm, ~mile 37) " +
      "and the Dawt Mill dam near the lower end—both are serious at higher flows. " +
      "The water is clear, cold, and spring-fed year-round.",
    weather_lat: 36.7281,
    weather_lon: -91.8524, // West Plains, MO
  },
  {
    slug: 'spring-river',
    float_summary:
      "At the Hardy gauge (primary), 206–694 cfs is the typical float range. Fed by " +
      "Mammoth Spring, the upper Spring River holds a steady, cold flow year-round and " +
      "rarely gets too low. Watch for pushy water and ledge drops after heavy rain.",
    float_tip:
      "The Spring River has two significant ledges—Saddler Falls and High Falls—that " +
      "should be scouted and can be dangerous at higher flows or for less-experienced " +
      "paddlers. Portage if in any doubt.",
    weather_lat: 36.3195,
    weather_lon: -91.4863, // Hardy, AR
  },
];

async function main() {
  const db = createAdminClient();
  for (const m of META) {
    const update: Record<string, unknown> = {
      float_summary: m.float_summary,
      float_tip: m.float_tip,
    };
    if (m.weather_lat != null) update.weather_lat = m.weather_lat;
    if (m.weather_lon != null) update.weather_lon = m.weather_lon;

    const { data, error } = await db
      .from('rivers')
      .update(update)
      .eq('slug', m.slug)
      .select('slug, weather_city, weather_lat, weather_lon');
    if (error) throw new Error(`${m.slug}: ${error.message}`);
    if (!data || data.length === 0) throw new Error(`${m.slug}: no row updated (slug not found)`);
    const r = data[0] as any;
    console.log(`✅ ${m.slug}: prose set; weather ${r.weather_city} (${r.weather_lat}, ${r.weather_lon})`);
  }
  console.log('\nDone. (active flag untouched — activation is a separate step.)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
