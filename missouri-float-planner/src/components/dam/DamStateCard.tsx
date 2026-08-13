// src/components/dam/DamStateCard.tsx
// A dam's current state — the row on /dams, and the supporting measurements
// below the generation console on /dams/[damId]. Server component: everything
// here is read-through data with no interaction, so there is nothing to hydrate.
//
// ── What moved out of this file ────────────────────────────────────────────
// The generation hero. It is now DamGenerationHero, rendered on the DETAIL page
// only, because a rack of eight generator cells repeated down a twenty-dam
// index is not scannable — and the index wraps this component in a `<Link>`, so
// it can gain no interactive descendants either. What is left here is the
// one-line now → next sentence, which is what a list surface actually needs.
//
// The copy discipline this file enforces is the whole point:
//
//  - A metric the dam does not publish is ABSENT from `metrics`, and absent
//    renders NOTHING. Clearwater has no powerhouse, so it must not show a
//    "Generation: 0 cfs" tile implying the turbines are merely idle.
//  - Generating vs idle is the fact a wading angler needs first, so it leads.
//  - A daily-mean release (MVS publishes release that way, about a day behind)
//    is labelled as such. Showing it as "releasing now" would be a correctness
//    bug, not a cosmetic one.
//  - Stale readings drop their emphasis rather than being hidden — a number
//    with an honest age beats no number.

import { Waves, Zap, Thermometer, Droplets, Fish, Ruler, Clock } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';
// One freshness voice across the dam surfaces, and across web and iOS. See
// shared/dam-schedule-copy.ts for why the hour arithmetic lives there.
import {
  relativeAge,
  tailwaterMovementSentence,
  readingStaleness,
  SCHEDULE_CHANGE_NOTE,
} from '@shared/dam-schedule-copy';
import { generationNow, nowNextClauses } from '@shared/dam-generation';

function formatCfs(value: number): string {
  return `${Math.round(value).toLocaleString()} cfs`;
}

/**
 * Whether a reading has aged out of usefulness, from its own timestamp.
 *
 * Deliberately not `metric.staleness`: that band is stamped when the server
 * assembles the snapshot and then frozen, so a payload held on a device keeps
 * claiming to be fresh as it ages. See readingStaleness in shared/.
 */
function isStale(metric: { at: string }): boolean {
  return readingStaleness(metric.at) === 'stale';
}

function Stat({
  icon,
  label,
  value,
  /**
   * A qualifier that belongs ON the value line but must not compete with the
   * number for weight — "elevation" beside 703.95 ft. Kept out of `value`
   * because at full display weight it wrapped onto its own line and read as a
   * second, unlabelled figure.
   */
  suffix,
  sub,
  dim,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  sub?: string | null;
  dim?: boolean;
}) {
  return (
    <div className={dim ? 'opacity-60' : undefined}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-neutral-900">
        {value}
        {suffix && <span className="ml-1 text-sm font-medium text-neutral-500">{suffix}</span>}
      </div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function DamStateCard({
  dam,
  /**
   * This card is NOT the top of the page.
   *
   * Set on the detail page, where DamGenerationHero sits above it and already
   * carries the dam's name, the generation summary and the release figure. Two
   * copies of one fact on one screen read as two facts, and a second <h2> with
   * the same name reads as a second dam.
   *
   * What survives here in either case is the supporting measurement grid — lake
   * level, tailwater stage and temperature, inflow, fishery — which is what this
   * component is for once generation has moved out of it.
   */
  secondary,
}: {
  dam: DamSnapshot;
  secondary?: boolean;
}) {
  const { metrics } = dam;
  const release = metrics.release;
  const generation = metrics.generationFlow;
  const pool = metrics.poolElevation;
  const floodPool = metrics.pctFloodPool;
  const tailwaterTemp = metrics.tailwaterTempF;
  const tailwaterStage = metrics.tailwaterElevation;
  const inflow = metrics.inflow;

  // Only a dam that actually reports turbine flow can claim a generating
  // state. `null` means "we don't know", which is different from "idle".
  const generating = dam.generating;

  // The one-line version of the console: what Eddy MEASURED, then what SWPA has
  // SCHEDULED. Two strings rather than one because they can honestly disagree —
  // a unit trips, a schedule is revised after Eddy fetched it — and a list row
  // that merged them would give a plan the weight of a measurement.
  //
  // The scheduled half is also the only live line the two Kansas City projects
  // can have at all: that district publishes no timeseries, so Stockton and
  // Truman have no observation to show.
  const clauses = secondary
    ? null
    : nowNextClauses(generationNow(dam), dam.schedule, dam.generationReference);

  return (
    <div className="rounded-xl border-2 border-t-4 border-primary-800 bg-white p-5 shadow-[4px_4px_0_var(--color-primary-200)]">
      {secondary ? (
        <h2
          className="text-lg font-bold text-neutral-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Dam and lake measurements
        </h2>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            className="text-xl font-bold text-neutral-900"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {dam.name}
          </h2>
          <span className="text-xs text-neutral-500">
            {dam.lakeName ?? 'USACE project'} · {dam.state}
          </span>
        </div>
      )}

      {/* The chip is `primary`, not `accent`. Coral was the only warm colour on
          a page whose every other magnitude cue is the teal ramp, so it read as
          a warning about the river rather than as the state of a powerhouse. */}
      {!secondary && generating !== null && (
        <div className="mt-3">
          <span
            className={
              generating
                ? 'inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-sm font-bold text-primary-800'
                : 'inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm font-bold text-neutral-700'
            }
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            {generating ? 'Generating' : 'Not generating'}
          </span>
          {generation && (
            <span className="ml-2 text-sm tabular-nums text-neutral-600">
              {formatCfs(generation.value)} through the turbines
            </span>
          )}
        </div>
      )}

      {/* The note is not decoration and must not be dropped to save a line: the
          index page renders this transition with no schedule block beneath it,
          so it is the only place SWPA's "subject to change" — and the fact that
          downstream water lags the dam — appears on that page at all. */}
      {clauses && (
        <div className="mt-2">
          <p className="text-sm font-medium text-neutral-800">{clauses.observed}</p>
          {clauses.scheduled && (
            <>
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-800">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {clauses.scheduled}
              </p>
              <p className="text-xs text-neutral-500">{SCHEDULE_CHANGE_NOTE}</p>
            </>
          )}
        </div>
      )}

      {/* Tailwater facts lead, lake facts follow. The water below the dam is
          what someone is standing in; the pool is context. */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Hidden only when the hero above ACTUALLY carried it. A flood-control
            project renders no hero at all — DamGenerationHero returns null for
            a dam with no powerhouse — so on Clearwater this is the only place
            total release appears, and suppressing it on `secondary` alone
            deleted the one live number that page has. */}
        {release && !(secondary && dam.hasTurbines) && (
          <Stat
            icon={<Waves className="h-3.5 w-3.5" />}
            label={release.dailyMean ? 'Release (daily avg)' : 'Releasing'}
            value={formatCfs(release.value)}
            sub={
              release.dailyMean
                ? ['daily average', relativeAge(release.at)].filter(Boolean).join(', ')
                : relativeAge(release.at)
            }
            dim={isStale(release)}
          />
        )}
        {/* Level below the dam, with how far it moved in three hours.
            Measured 2026-08-12, this swings 8.19 ft at Table Rock and 7.67 ft at
            Bull Shoals between idle and full generation — and unlike the
            schedule it also catches water nobody announced.

            The unit is spelled "elevation" in the value, not left as a bare
            "710.79 ft": this is height above a vertical datum, and a number that
            size labelled "stage" reads as depth to anyone who has waded a river.
            Nobody is standing in 710 feet of water.

            The movement and the age travel together — see
            tailwaterMovementSentence for why the age can never be dropped. */}
        {tailwaterStage && (
          <Stat
            icon={<Ruler className="h-3.5 w-3.5" />}
            label="Water level below dam"
            value={`${tailwaterStage.value.toFixed(2)} ft`}
            suffix="elevation"
            sub={tailwaterMovementSentence(tailwaterStage)}
            dim={isStale(tailwaterStage)}
          />
        )}
        {tailwaterTemp && (
          <Stat
            icon={<Thermometer className="h-3.5 w-3.5" />}
            label="Tailwater temp"
            value={`${tailwaterTemp.value.toFixed(1)} °F`}
            sub={tailwaterTemp.value < 60 ? 'cold release' : null}
            dim={isStale(tailwaterTemp)}
          />
        )}
        {pool && (
          <Stat
            icon={<Droplets className="h-3.5 w-3.5" />}
            label="Lake level"
            value={`${pool.value.toFixed(2)} ft`}
            sub={floodPool ? `${floodPool.value.toFixed(0)}% flood pool` : relativeAge(pool.at)}
            dim={isStale(pool)}
          />
        )}
        {/* Inflow against release is what says whether the lake is filling, and
            so whether the Corps will have to run water in the days ahead. Stated
            as a bare number rather than a verdict: turning the pair into "the
            lake is rising" would ignore rainfall, evaporation and the pool the
            operator is actually targeting. */}
        {inflow && (
          <Stat
            icon={<Droplets className="h-3.5 w-3.5" />}
            label={inflow.dailyMean ? 'Inflow (daily avg)' : 'Inflow'}
            value={formatCfs(inflow.value)}
            // Age included for the same reason as the tailwater reading: this
            // shipped with only "into the lake" beneath it and no indication of
            // when it was measured, which on the two St. Louis dams is a daily
            // mean about a day in arrears.
            sub={[inflow.dailyMean ? 'daily average into the lake' : 'into the lake', relativeAge(inflow.at)]
              .filter(Boolean)
              .join(' · ')}
            dim={isStale(inflow)}
          />
        )}
        {/* Declared in the registry, not inferred from the temperature reading.
            Norfork is a premier trout tailwater that publishes no water
            temperature at all, so inferring this dropped the label on exactly
            the fishery most worth naming — and inferring it the other way would
            have put a trout badge on cool-but-warmwater tailwaters like the Sac
            below Stockton. */}
        {dam.tailwaterFishery && (
          <Stat
            icon={<Fish className="h-3.5 w-3.5" />}
            label="Tailwater fishery"
            value={dam.tailwaterFishery === 'trout' ? 'Trout' : 'Warmwater'}
            sub={
              dam.tailwaterFishery === 'trout'
                ? 'cold year-round, deep release'
                : 'bass, crappie, catfish'
            }
          />
        )}
      </div>

      {/* "nameplate" is spelled out because the generation console above sizes
          everything against SWPA's SCHEDULING capacity, which is a different
          number for the same plant — 340 installed against 391 scheduled at
          Bull Shoals. Two bare megawatt figures on one page read as a
          contradiction; two labelled ones read as what they are. */}
      {dam.nameplate && (
        <p className="mt-3 text-xs text-neutral-500">
          {dam.nameplate.units} generating {dam.nameplate.units === 1 ? 'unit' : 'units'} ·{' '}
          {dam.nameplate.megawatts} MW nameplate
        </p>
      )}

      {Object.keys(metrics).length === 0 && (
        // Stockton and Truman are SWPA-only: the Kansas City district
        // publishes no timeseries at all, so there are no levels to show.
        <p className="mt-3 text-sm text-neutral-500">
          The Corps does not publish live levels for this project. The generation
          schedule below is the available data.
        </p>
      )}
    </div>
  );
}
