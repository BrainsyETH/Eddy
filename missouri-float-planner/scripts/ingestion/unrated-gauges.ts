import type { GaugeCandidate, RiverSectionDossier } from './dossier';
import { readinessProblems, type RiverReadiness } from './readiness';

/** Explicit, reviewed measurement links; never synthesize threshold anchors. */
export function unratedGaugePlan(dossier: {
  conditionRatingMode?: string;
  primaryGaugeSiteId?: string;
  gauges: GaugeCandidate[];
  sections: RiverSectionDossier[];
  readiness?: RiverReadiness;
}) {
  const problems: string[] = [];
  const links: Array<{ siteId: string; unit: 'ft' | 'cfs' }> = [];
  if (!['rated', 'unrated'].includes(dossier.conditionRatingMode ?? 'rated')) {
    problems.push('Invalid conditionRatingMode');
  }
  if (dossier.conditionRatingMode !== 'unrated') return { problems, links };
  problems.push(...readinessProblems(dossier.readiness).filter(p => p.startsWith('conditions:')));
  if (dossier.readiness?.conditions?.ratingMode !== 'unrated') problems.push('Conditions review must explicitly select unrated');
  if (!dossier.primaryGaugeSiteId) problems.push('Unrated release still requires an explicit primary gauge');
  if (dossier.sections.some(s => s.thresholds?.length)) problems.push('Unrated dossier must not contain recreational anchors');
  const ids = new Set([dossier.primaryGaugeSiteId, ...dossier.sections.map(s => s.representativeGauge.siteId)]);
  for (const siteId of ids) {
    if (!siteId) continue;
    const gauge = dossier.gauges.find(g => g.siteId === siteId);
    const unit = gauge?.measurementUnit;
    if (!gauge || !['ft', 'cfs'].includes(unit ?? '') ||
        !gauge.paramsAvailable.includes(unit === 'ft' ? '00065' : '00060') ||
        !Number.isFinite(gauge.lat) || !Number.isFinite(gauge.lon)) {
      problems.push(`Unrated gauge ${siteId} needs verified coordinates and an explicit available measurement unit`);
      continue;
    }
    links.push({ siteId, unit: unit! });
  }
  return { problems, links };
}
