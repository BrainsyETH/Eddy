#!/usr/bin/env npx tsx
/**
 * Activate river(s) and report validate_river_data() findings for them.
 *
 * validate_river_data() only evaluates active rivers, so we flip active=true
 * first, then read back its findings. If any 'error'-severity finding appears
 * for a river, this script rolls that river back to inactive (errors mean the
 * condition badge / core UX is broken) and reports it. 'warning' findings are
 * printed but left active (they're the documented, intentional gaps) — and are
 * now split into waived and unwaived against scripts/ingestion/warning-waivers.ts,
 * so "documented" means a reason, an owner and a review date rather than a habit.
 *
 * Usage:
 *   npx tsx scripts/ingestion/activate-rivers.ts <slug> [<slug> ...]
 *   npx tsx scripts/ingestion/activate-rivers.ts <slug> --dry   (validate only, no change)
 */
import { createAdminClient } from '../../src/lib/supabase/admin';
import { expiredWaivers, isWaived } from './warning-waivers';

async function findings(db: ReturnType<typeof createAdminClient>, slugs: string[]) {
  const { data, error } = await db.rpc('validate_river_data');
  if (error) throw error;
  return ((data ?? []) as any[]).filter((r) => slugs.includes(r.river_slug));
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const slugs = args.filter((a) => !a.startsWith('--'));
  if (!slugs.length) { console.error('Usage: activate-rivers.ts <slug> [<slug> ...] [--dry]'); process.exit(1); }

  const db = createAdminClient();

  if (!dry) {
    const { error } = await db.from('rivers').update({ active: true }).in('slug', slugs);
    if (error) throw error;
    console.log(`Set active=true for: ${slugs.join(', ')}`);
  }

  const found = await findings(db, slugs);
  const errors = found.filter((f) => f.severity === 'error');
  const allWarnings = found.filter((f) => f.severity === 'warning');

  // Waived warnings are separated, not hidden. The point of a waiver is that
  // somebody looked; printing it keeps the decision visible at exactly the
  // moment it is being relied on, and an expired one stops suppressing.
  const today = new Date().toISOString().slice(0, 10);
  const waived = allWarnings.filter((f) => isWaived(f.river_slug, f.check_name, today));
  const warnings = allWarnings.filter((f) => !isWaived(f.river_slug, f.check_name, today));

  console.log(`\nvalidate_river_data(): ${errors.length} error(s), ${warnings.length} unwaived warning(s), ${waived.length} waived across ${slugs.length} river(s)`);
  for (const f of [...errors, ...warnings]) {
    console.log(`  ${f.severity === 'error' ? '❌' : '⚠️ '} ${f.river_slug}  ${f.check_name}: ${f.detail}`);
  }
  for (const f of waived) {
    const w = isWaived(f.river_slug, f.check_name, today)!;
    console.log(`  🅦  ${f.river_slug}  ${f.check_name}: waived by ${w.owner} until ${w.reviewBy} — ${w.reason}`);
  }

  // Surfaced whether or not the warning still fires: a waiver that outlived its
  // review date is a decision nobody has revisited, which is the thing waivers
  // exist to prevent becoming permanent.
  const stale = expiredWaivers(today).filter((w) => slugs.includes(w.riverSlug));
  for (const w of stale) {
    console.log(`  ⌛ ${w.riverSlug}  ${w.checkName}: WAIVER EXPIRED ${w.reviewBy} (${w.owner}) — re-decide it`);
  }

  // Roll back on errors OR unwaived warnings.
  //
  // Reporting a warning and activating anyway is what this script did before,
  // and it is indistinguishable from not checking: "every remaining warning is
  // explicitly waived" is only true if an unwaived one stops the launch. A
  // warning is cheap to clear — fix it, or write down why it stays.
  //
  // ── The first-activation shape, so nobody "fixes" this by loosening it ────
  // validate_river_data() only evaluates ACTIVE rivers, so this script flips
  // active=true and reads back. A river being activated for the first time has
  // therefore never been polled, and `stale_gauge` fires on it every time —
  // usually alongside missing_characteristics, missing_weather_point and
  // missing_alert_terms. That is not this gate misfiring. It is the gate
  // saying the river is not finished, and the answer is to finish it: wire the
  // gauges, let one cron pass run, fill the characteristics and weather point,
  // THEN activate. A short-dated waiver is the escape hatch when that ordering
  // genuinely cannot be met, and it expires by itself.
  const blocking = [...errors, ...warnings];
  if (!dry && blocking.length) {
    const bad = Array.from(new Set(blocking.map((e) => e.river_slug)));
    const { error } = await db.from('rivers').update({ active: false }).in('slug', bad);
    if (error) throw error;
    const why = errors.length
      ? `${errors.length} error(s)` + (warnings.length ? ` and ${warnings.length} unwaived warning(s)` : '')
      : `${warnings.length} unwaived warning(s)`;
    console.log(`\n❌ Rolled back to inactive (${why}): ${bad.join(', ')}`);
    if (warnings.length) {
      console.log(
        '   Fix each warning, or record a reason, owner and review date in scripts/ingestion/warning-waivers.ts.',
      );
    }
    process.exit(2);
  }

  if (!dry) {
    const active = slugs.filter((s) => !blocking.some((e) => e.river_slug === s));
    console.log(`\n✅ Active & live: ${active.join(', ')}${waived.length ? `  (${waived.length} waived warning(s) above)` : ''}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
