import {
  checked,
  numeric,
  station,
  type Access,
  type DataContext,
  type GaugeLink,
  type River,
} from './data';
import { MAX_ESTIMATES } from './planning';

export interface Reach {
  id: string;
  sort_order: number;
  river_mile_start: number | null;
  river_mile_end: number | null;
  primary_gauge_station_id: string | null;
}

function reachAt(mile: number, reaches: Reach[]) {
  return [...reaches]
    .sort((a, b) => a.sort_order - b.sort_order)
    .find(
      (r) =>
        r.primary_gauge_station_id &&
        (r.river_mile_start == null || mile >= r.river_mile_start) &&
        (r.river_mile_end == null || mile < r.river_mile_end),
    );
}

/** Mile-based selection in get_river_condition_segment, including explicit
 * reach overrides (00204 and 20260826162627). Screening never replaces the
 * estimator's authoritative SQL selection. Inactive overrides stay unknown.
 */
export function screeningGauge(
  mile: number,
  links: GaugeLink[],
  reaches: Reach[],
) {
  const reach = reachAt(mile, reaches);
  if (reach)
    return (
      links.find(
        (g) =>
          g.gauge_station_id === reach.primary_gauge_station_id &&
          station(g)?.active,
      ) ?? null
    );
  const positioned = links
    .filter((g) => station(g)?.active && numeric(g.river_mile) != null)
    .sort((a, b) => Number(a.river_mile) - Number(b.river_mile));
  return (
    positioned.filter((g) => Number(g.river_mile) <= mile).at(-1) ??
    positioned.find((g) => Number(g.river_mile) > mile) ??
    links.find((g) => g.is_primary && station(g)?.active) ??
    null
  );
}

interface Candidate {
  putIn: Access;
  takeOut: Access;
  difference: number;
  group: string;
  unknown: boolean;
}
export interface Screening {
  links: GaugeLink[];
  reaches: Reach[];
  ratings: Map<string, string>;
}

export async function loadScreening(
  ctx: DataContext,
  river: River,
): Promise<Screening> {
  const [links, reaches] = await Promise.all([
    ctx.gauges(river.id),
    ctx.db
      .from('river_sections')
      .select(
        'id, sort_order, river_mile_start, river_mile_end, primary_gauge_station_id',
      )
      .eq('river_id', river.id)
      .order('sort_order')
      .limit(501)
      .then((response) => checked(response, 'river reaches') ?? []),
  ]);
  if (links.length > 500 || reaches.length > 500)
    throw new Error('Screening catalog exceeds limit');
  const views = await Promise.all(
    links.filter((g) => station(g)?.active).map((g) => ctx.gaugeView(river, g)),
  );
  return {
    links,
    reaches,
    ratings: new Map(views.map((g) => [g.id, g.conditionCode])),
  };
}

/** Keep at most two duration-fit pairs per put-in, then diversify reaches,
 * put-ins and overlap. Unknown/stale readings survive for full assessment.
 */
export function screenCandidates(
  points: Access[],
  targetHours: number,
  speedMph: number,
  publicOnly: boolean,
  screen?: Screening,
) {
  const eligible = points
    .filter(
      (p) =>
        p.approved &&
        p.is_float_endpoint &&
        (!publicOnly || p.is_public === true) &&
        numeric(p.river_mile_downstream) != null,
    )
    .sort(
      (a, b) =>
        Number(a.river_mile_downstream) - Number(b.river_mile_downstream) ||
        a.id.localeCompare(b.id),
    );
  const unsuitable = new Set(['too_low', 'high', 'dangerous']);
  const pool: Candidate[] = [];
  const counts = {
    eligiblePutIns: Math.max(0, eligible.length - 1),
    ratedFloatablePutIns: 0,
    unsuitablePutIns: 0,
    unknownPutIns: 0,
    screenedOutPairs: 0,
    eligiblePairs: 0,
  };
  const first = Number(eligible[0]?.river_mile_downstream ?? 0);
  const extent = Math.max(
    1,
    Number(eligible.at(-1)?.river_mile_downstream ?? 0) - first,
  );
  const positioned = (screen?.links ?? [])
    .filter((g) => station(g)?.active && numeric(g.river_mile) != null)
    .sort((a, b) => Number(a.river_mile) - Number(b.river_mile));
  for (let i = 0; i < eligible.length - 1; i++) {
    const putIn = eligible[i],
      start = Number(putIn.river_mile_downstream);
    // Duplicate-mile endpoints cannot start a downstream route by themselves.
    if (start >= Number(eligible.at(-1)?.river_mile_downstream)) {
      counts.eligiblePutIns--;
      continue;
    }
    const gauge = screen && screeningGauge(start, screen.links, screen.reaches);
    const code = gauge
      ? (screen!.ratings.get(gauge.gauge_station_id) ?? 'unknown')
      : 'unknown';
    if (unsuitable.has(code)) counts.unsuitablePutIns++;
    else if (code === 'unknown') counts.unknownPutIns++;
    else counts.ratedFloatablePutIns++;
    const local: Candidate[] = [];
    const group =
      (screen && reachAt(start, screen.reaches)?.id) ||
      `mile-quarter-${Math.min(3, Math.floor(((start - first) / extent) * 4))}`;
    const span = positioned.filter((g) => Number(g.river_mile) >= start);
    let spanIndex = 0;
    let spanUnsuitable = false;
    let spanUnknown = false;
    for (const takeOut of eligible.slice(i + 1)) {
      const end = Number(takeOut.river_mile_downstream);
      if (end <= start) continue;
      counts.eligiblePairs++;
      // Endpoints are ordered: advance across each gauge once per put-in,
      // rather than rescan/sort the entire gauge and reach catalog per pair.
      while (
        spanIndex < span.length &&
        Number(span[spanIndex].river_mile) <= end
      ) {
        const spanCode =
          screen!.ratings.get(span[spanIndex++].gauge_station_id) ?? 'unknown';
        spanUnsuitable ||= unsuitable.has(spanCode);
        spanUnknown ||= spanCode === 'unknown';
      }
      if (unsuitable.has(code) || spanUnsuitable) {
        counts.screenedOutPairs++;
        continue;
      }
      local.push({
        putIn,
        takeOut,
        difference: Math.abs((end - start) / speedMph - targetHours),
        group,
        unknown: code === 'unknown' || spanUnknown,
      });
      local.sort(
        (a, b) =>
          a.difference - b.difference ||
          a.takeOut.id.localeCompare(b.takeOut.id),
      );
      if (local.length > 2) local.pop();
    }
    pool.push(...local);
  }
  const candidates: Candidate[] = [];
  const groups = new Set<string>(),
    putIns = new Set<string>();
  const overlap = (c: Candidate) =>
    candidates.some(
      (p) =>
        Math.max(
          Number(p.putIn.river_mile_downstream),
          Number(c.putIn.river_mile_downstream),
        ) <
        Math.min(
          Number(p.takeOut.river_mile_downstream),
          Number(c.takeOut.river_mile_downstream),
        ),
    );
  while (pool.length && candidates.length < MAX_ESTIMATES) {
    pool.sort(
      (a, b) =>
        Number(a.unknown) - Number(b.unknown) ||
        Number(groups.has(a.group)) - Number(groups.has(b.group)) ||
        Number(putIns.has(a.putIn.id)) - Number(putIns.has(b.putIn.id)) ||
        Number(overlap(a)) - Number(overlap(b)) ||
        a.difference - b.difference ||
        a.putIn.id.localeCompare(b.putIn.id) ||
        a.takeOut.id.localeCompare(b.takeOut.id),
    );
    const next = pool.shift()!;
    candidates.push(next);
    groups.add(next.group);
    putIns.add(next.putIn.id);
  }
  return {
    candidates,
    coverage: {
      ...counts,
      status: screen ? 'ok' : 'partial',
      basis:
        'Current stored readings at recorded eligible put-ins and positioned route gauges; not a whole-river or future-date verdict.',
      note: screen
        ? 'Unknown readings remain eligible for full assessment.'
        : 'Screening was unavailable; candidates were diversified without a preliminary condition exclusion.',
    },
  };
}
