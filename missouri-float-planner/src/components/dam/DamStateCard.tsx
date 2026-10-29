// src/components/dam/DamStateCard.tsx
// Supporting measurements below the generation console on /dams/[damId].
// The detail page supplies its live display clock. The /dams index uses the
// smaller DamListCard, with flow estimates and only its summary measurements.
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

import { Zap, Clock } from 'lucide-react';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import type { DamSnapshot } from '@/lib/data/dams';
import Card from '@/components/ui/Card';
// One freshness voice across the dam surfaces, and across web and iOS. See
// shared/dam-schedule-copy.ts for why the hour arithmetic lives there.
import {
  relativeAge,
  tailwaterMovementSentence,
  readingStaleness,
  SCHEDULE_CHANGE_NOTE,
} from '@shared/dam-schedule-copy';
import {
  generationNow,
  generationStatusLabel,
  nowNextClauses,
  spillwayRelease,
  spillwayReleaseLabel,
} from '@shared/dam-generation';

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
function isStale(metric: { at: string }, now: number): boolean {
  return readingStaleness(metric.at, now) === 'stale';
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
  /** The same Eddy mark the app's DamStateCard draws for this stat. */
  icon: EddyIconName;
  label: string;
  value: string;
  suffix?: string;
  sub?: string | null;
  dim?: boolean;
}) {
  return (
    <div className={dim ? 'opacity-60' : undefined}>
      {/* min-h-8 holds the row at the 28px mark's height, so a stat whose
          art is shorter does not sit higher than its neighbours. */}
      <div className="flex min-h-8 items-center gap-1.5 text-xs font-medium text-neutral-500">
        <EddyIcon name={icon} size={28} />
        {label}
      </div>
      <div className="mt-1 font-mono text-xl text-primary-800">
        {value}
        {suffix && <span className="ml-1 font-sans text-xs text-neutral-600">{suffix}</span>}
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
   * Set on the detail page, where GenerationCard sits above it and already
   * carries the generation summary and the release figure. Two
   * copies of one fact on one screen read as two facts, and a second <h2> with
   * the same name reads as a second dam.
   *
   * What survives here in either case is the supporting measurement grid — lake
   * level, tailwater stage and temperature, inflow, fishery — which is what this
   * component is for once generation has moved out of it.
   */
  secondary,
  now = Date.now(),
}: {
  dam: DamSnapshot;
  secondary?: boolean;
  now?: number;
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
  // A flood-control project has no powerhouse to report on, so it gets no
  // generation line at all — the same test the hero uses to render nothing.
  // Without it every such row on the index led with "This project has no
  // powerhouse", which is both noise and a contradiction of this card's own
  // rule that a null generating state renders nothing.
  const state = generationNow(dam, now);
  const minimumFlow = state.kind === 'not-generating' && state.minimumFlow;
  const spill = secondary ? null : spillwayRelease(dam, now);
  const clauses =
    secondary || generationStatusLabel(state) === null
      ? null
      : nowNextClauses(state, dam.schedule, dam.generationReference, now);

  return (
    <Card variant={secondary ? 'panel' : 'framed'} className="min-w-0 p-5 sm:p-6">
      {secondary ? (
        <h2
          className="text-xl font-semibold text-primary-800"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Dam &amp; lake
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
            {generating ? 'Generating' : minimumFlow ? 'Minimum flow' : 'Not generating'}
          </span>
          {generation && (
            <span className="ml-2 text-sm tabular-nums text-neutral-600">
              {formatCfs(generation.value)} through the turbines
            </span>
          )}
        </div>
      )}

      {spill && (
        <p className="mt-2 text-sm font-semibold text-accent-900">{spillwayReleaseLabel(spill)}</p>
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
      <div className={secondary ? "dam-measurements mt-5" : "mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"}>
        {/* GenerationCard carries total release for turbine AND gate-operated
            dams on the detail page. The index still needs its own figure. */}
        {release && !secondary && (
          <Stat
            icon="release"
            label={release.dailyMean ? 'Release (daily avg)' : 'Releasing'}
            value={formatCfs(release.value)}
            sub={
              release.dailyMean
                ? ['daily average', relativeAge(release.at, now)].filter(Boolean).join(', ')
                : relativeAge(release.at, now)
            }
            dim={isStale(release, now)}
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
            icon="damGauge"
            label="River level below dam"
            value={`${tailwaterStage.value.toFixed(2)} ft`}
            sub={tailwaterMovementSentence(tailwaterStage, now)}
            dim={isStale(tailwaterStage, now)}
          />
        )}
        {tailwaterTemp && (
          <Stat
            icon="waterTemperature"
            label="Water temp below dam"
            value={`${tailwaterTemp.value.toFixed(1)} °F`}
            sub={tailwaterTemp.value < 60 ? 'cold release' : null}
            dim={isStale(tailwaterTemp, now)}
          />
        )}
        {pool && (
          <Stat
            icon="damGauge"
            label="Lake level"
            value={`${pool.value.toFixed(2)} ft`}
            sub={floodPool ? `${floodPool.value.toFixed(0)}% flood pool` : relativeAge(pool.at, now)}
            dim={isStale(pool, now)}
          />
        )}
        {/* Inflow against release is what says whether the lake is filling, and
            so whether the Corps will have to run water in the days ahead. Stated
            as a bare number rather than a verdict: turning the pair into "the
            lake is rising" would ignore rainfall, evaporation and the pool the
            operator is actually targeting. */}
        {inflow && (
          <Stat
            icon="inflow"
            label={inflow.dailyMean ? 'Inflow (daily avg)' : 'Inflow'}
            value={formatCfs(inflow.value)}
            // Age included for the same reason as the tailwater reading: this
            // shipped with only "into the lake" beneath it and no indication of
            // when it was measured, which on the two St. Louis dams is a daily
            // mean about a day in arrears.
            sub={[inflow.dailyMean ? 'daily average into the lake' : 'into the lake', relativeAge(inflow.at, now)]
              .filter(Boolean)
              .join(' · ')}
            dim={isStale(inflow, now)}
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
            icon="fishery"
            label="Fishery below dam"
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
      {dam.nameplate && !secondary && (
        <p className="mt-3 text-xs text-neutral-500">
          {dam.nameplate.units} generating {dam.nameplate.units === 1 ? 'unit' : 'units'} ·{' '}
          {dam.nameplate.megawatts} MW nameplate
        </p>
      )}

      {Object.keys(metrics).length === 0 && (
        // Stockton and Truman are SWPA-only: the Kansas City district
        // publishes no timeseries at all, so there are no levels to show.
        <p className="mt-3 text-sm text-neutral-500">
          The Corps does not publish live levels for this dam. The generation
          schedule is the available data.
        </p>
      )}
    </Card>
  );
}
