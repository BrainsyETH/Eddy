#!/usr/bin/env npx tsx
/** Cold-start prose (float_summary + float_tip) for the 3rd batch, written from
 *  the owner-approved ladders + researched hazards. Weather coords are already
 *  set by ingest-dossier. Does not touch `active`. Idempotent. */
import { createAdminClient } from '../../src/lib/supabase/admin';

const PROSE: Record<string, { summary: string; tip: string }> = {
  'caddo-river': {
    summary: "At the Caddo Gap gauge (primary), 5.5–6.1 ft is the sweet spot for the classic Caddo Gap–to–Glenwood float. Below ~5.25 ft it turns bony and you'll drag; 6.2–7.0 ft runs fast and fun for rafts and experienced paddlers, and above 7.0 ft the casual float is off. The Caddo is a clear Ouachita Mountain river that rises fast after rain.",
    tip: "The Caddo is flashy—it can jump several feet within hours of heavy rain (the deadly 2010 Albert Pike flood was on the next river over). Never camp low on gravel bars, and get off the water when the gauge is rising.",
  },
  'war-eagle-creek': {
    summary: "At the Hindsville (Hwy 45) gauge (primary), 2.0–3.5 ft is floatable, with 2.5–3.5 ft ideal; below ~1.8 ft you'll scrape and drag. War Eagle is a rain-fed northwest-Arkansas creek that runs best March through June and drops low by mid-summer.",
    tip: "Portage the low-head dam at the historic War Eagle Mill near the lower end. The creek is flashy—just over 4 ft is flood stage on the Hwy 45 gauge—so watch for a rising, muddy gauge after rain.",
  },
  'mulberry': {
    summary: "At the Mulberry gauge (primary), about 2.0–3.5 ft is prime for Arkansas's best-known float—lively Class I–II water; below ~1.2 ft you'll drag. It stiffens fast as it rises: above ~4 ft it's pushy, and 8 ft and up is experts-only. The Mulberry is undammed and very flashy, usually floatable late October through mid-June.",
    tip: "The Mulberry rises and falls several feet within a day—don't launch on a rising gauge, and stay right to get under the low-water bridge near Turner Bend. It's a serious whitewater river at high flows.",
  },
  'crooked-creek': {
    summary: "At the Kelly's Slab / Yellville gauge (primary), about 10.5–12.5 ft is the ideal range on this Blue Ribbon smallmouth stream; below ~10.5 ft you'll drag over gravel. 13–13.5 ft runs high and pushy, and above ~13.5 ft is dangerous. Crooked Creek is entirely rain-fed and drops low in summer.",
    tip: "Use caution at Kelly's Slab (a low-water bridge). Crooked Creek can turn from a trickle into a raging torrent within hours of heavy rain, and there's no official flood gauge—treat any rapid rise as dangerous.",
  },
  'bryant-creek': {
    summary: "At the Tecumseh gauge (primary), about 300–600 cfs is comfortable floating on Bryant Creek; around 245 cfs it's low but floatable (expect dragging), and below ~200 cfs most riffles drag. This spring-influenced Ozark creek runs lower and flashier than the neighboring North Fork, into which it empties.",
    tip: "Bryant is narrow and willow-choked in places (especially above Hwy 95)—watch for strainers—and it rises and muddies fast after local rain, so inspect visually before putting in. The popular reach is Hodgson Mill to Warren Bridge.",
  },
  'big-river': {
    summary: "At the Byrnesville gauge (primary), roughly 200–600 cfs is comfortable floating; below ~90 cfs you'll scrape, and above ~600 cfs it runs high and pushy for a beginner river. The popular Washington State Park reach upstream runs a bit lower. Big River is a slow, scenic Ozark float.",
    tip: "Portage the old mill/low-head dams on the lower river (Byrnes Mill, Cedar Hill, Morse Mill). Big River drains the historic Old Lead Belt—MDC keeps a fish-consumption advisory, so avoid stirring up or ingesting bottom sediment.",
  },
  'big-piney': {
    summary: "At the Big Piney (Ross) gauge (primary), roughly 519–1013 cfs is the ideal float range; below ~164 cfs you'll drag over gravel, and above ~1014 cfs it runs high—2049 cfs and up is dangerous. This spring-influenced Ozark stream through Mark Twain National Forest stays runnable through most summers but is flashy after rain.",
    tip: "A 12-mile middle stretch through Fort Leonard Wood is closed to the public—Ross is the last legal take-out on the upper river, and the lower float resumes below at East Gate/Devils Elbow. Watch for low-water bridges.",
  },
};

async function main() {
  const db = createAdminClient();
  for (const [slug, p] of Object.entries(PROSE)) {
    const { data, error } = await db.from('rivers').update({ float_summary: p.summary, float_tip: p.tip }).eq('slug', slug).select('slug');
    if (error) throw new Error(`${slug}: ${error.message}`);
    if (!data?.length) throw new Error(`${slug}: no row`);
    console.log(`✅ ${slug}: prose set`);
  }
  console.log('\nDone (active flag untouched).');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
