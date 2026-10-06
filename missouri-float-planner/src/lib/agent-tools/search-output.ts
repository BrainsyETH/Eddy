import type { Planning } from './planning';
import type { Sources } from './sources';

const excerpt = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

/** Search answers remain useful on their own, with full plans for details. */
export function summarizePlan(
  plan: Awaited<ReturnType<Planning['calculate']>>,
) {
  const p = plan.data;
  const point = (a: typeof p.putIn) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    riverMile: a.riverMile,
    isFloatEndpoint: a.isFloatEndpoint,
    isPublic: a.isPublic,
    url: a.url,
  });
  const reasons = (rows: typeof p.routeAssessment.cautionReasons) =>
    rows.slice(0, 8).map((r) => ({ ...r, message: excerpt(r.message, 240) }));
  const warnings = [
    ...new Set(
      plan.warnings.filter(
        (w) =>
          ![
            ...p.routeAssessment.blockingReasons,
            ...p.routeAssessment.cautionReasons,
          ].some((r) => r.message === w),
      ),
    ),
  ];
  const detailRequired =
    [
      p.routeAssessment.blockingReasons,
      p.routeAssessment.cautionReasons,
      p.routeAssessment.notices,
    ].some(
      (rows) => rows.length > 8 || rows.some((r) => r.message.length > 240),
    ) ||
    p.outlooks.length > 6 ||
    p.damsBelowTakeOut.length > 6 ||
    warnings.length > 6 ||
    warnings.some((w) => w.length > 240);
  return {
    status: detailRequired ? 'partial' : plan.status,
    data: {
      url: p.url,
      requestedDate: p.requestedDate,
      timeZone: p.timeZone,
      vesselType: p.vesselType,
      putIn: point(p.putIn),
      takeOut: point(p.takeOut),
      distanceMiles: p.distanceMiles,
      estimatedFloatTime: p.estimatedFloatTime,
      estimateBasis: p.estimateBasis,
      conditionAvailability: p.conditionAvailability,
      conditionNote: p.conditionNote,
      damsBelowTakeOut: p.damsBelowTakeOut.slice(0, 6),
      floatTimeWithheldReason: p.floatTimeWithheldReason,
      anchorGauge: p.anchorGauge,
      routeAssessment: {
        conditionCode: p.routeAssessment.conditionCode,
        label: p.routeAssessment.label,
        recommendationStatus: p.routeAssessment.recommendationStatus,
        spanCheckComplete: p.routeAssessment.spanCheckComplete,
        blockingReasons: reasons(p.routeAssessment.blockingReasons),
        cautionReasons: reasons(p.routeAssessment.cautionReasons),
        notices: reasons(p.routeAssessment.notices),
      },
      outlooks: p.outlooks.slice(0, 6).map((o) => ({
        status: o.status,
        gauge: o.gauge,
        days: o.days,
        issuedAt: o.issuedAt,
        source: o.source,
        reason: o.reason,
      })),
      warnings: warnings.slice(0, 6).map((w) => excerpt(w, 240)),
      detailRequired,
      details: detailRequired
        ? 'Call plan_float before presenting this option; some details are abbreviated.'
        : 'Call plan_float for full hazards, notices, weather and nearby outfitters.',
    },
  };
}

export function summarizeAlerts(
  checks: Awaited<ReturnType<Sources['alerts']>>,
) {
  // Classify full provider text before presentation truncation. More urgent
  // notices appear first, but overflow is always explicit to the caller.
  const alerts = [...checks.alerts].sort(
    (a, b) =>
      Number(b.severity === 'warning') - Number(a.severity === 'warning'),
  );
  const truncated =
    alerts.length > 8 ||
    alerts.some((a) => a.body.length > 300 || a.title.length > 180);
  return {
    ...checks,
    alerts: alerts.slice(0, 8).map((a) => ({
      ...a,
      title: excerpt(a.title, 180),
      body: excerpt(a.body, 300),
    })),
    totalAlerts: alerts.length,
    truncated,
    details: truncated
      ? 'Use get_river_alerts or the official source URLs for complete notices.'
      : null,
  };
}
