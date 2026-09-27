import type { RiverAlert } from '@/types/api';

export interface RecommendationReason {
  code: string;
  message: string;
  sourceId?: string;
}

interface Hazard {
  id: string;
  name: string;
  severity: string | null;
  portage_required: boolean | null;
}

interface AlertChecks {
  checkedAllApplicable: boolean;
  alerts: RiverAlert[];
  sources: Array<{ source: string; status: string; reason?: string; reasonCode?: string }>;
}

export interface RecommendationInput {
  usable: boolean;
  hasDuration: boolean;
  conditionCode: string;
  lowSpanGauge: boolean;
  future: boolean;
  forecastComplete: boolean;
  forecastUnsuitable: boolean;
  hazards: Hazard[];
  unlocatedHazards: Hazard[];
  alerts: AlertChecks;
  riverName: string;
  endpointNames: string[];
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Only explicit closure statements about this river or an endpoint block.
 * County matches and park categories establish neither route overlap nor a
 * river closure. Ambiguous, qualified or scoped prose remains conditional.
 * This intentionally recognises a small set of direct statements, not NLP.
 */
export function closureAffectsRoute(alert: RiverAlert, riverName: string, endpoints: string[]) {
  if (alert.source !== 'nps' || !/\bclosure\b/i.test(alert.category)) return false;
  const text = `${alert.title}. ${alert.body}`;
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim());
  for (const sentence of sentences) {
    // Don't promote a future/conditional/partial closure into a current whole
    // route closure, or mistake a reopening announcement for a closure.
    if (
      /\b(if|may|might|could|will|until|reopen\w*|no longer|not|except|from|between|near)\b/i.test(
        sentence,
      )
    )
      continue;
    for (const name of endpoints) {
      const endpoint = escapePattern(name);
      if (
        new RegExp(
          `^(?:the )?${endpoint}(?: (?:access|boat ramp|launch))? (?:is |remains |currently )?closed(?:$| to (?:all use|the public|boating|launching)$)`,
          'i',
        ).test(sentence)
      )
        return true;
    }
    const river = escapePattern(riverName);
    if (
      new RegExp(
        `^(?:the |entire |the entire )?${river} (?:is |remains |currently )?closed(?:$| to (?:all use|the public|boating|floating|paddling)$)`,
        'i',
      ).test(sentence)
    )
      return true;
    if (
      /^(?:the )?(?:entire park|all park waters|all river access points) (?:is |are |remain |remains )?closed$/i.test(
        sentence,
      )
    )
      return true;
  }
  return false;
}

/** A single decision table shared by explicit plans and ranked searches. */
export function assessRecommendation(input: RecommendationInput) {
  const blockingReasons: RecommendationReason[] = [];
  const cautionReasons: RecommendationReason[] = [];
  const block = (code: string, message: string, sourceId?: string) => {
    blockingReasons.push({ code, message, ...(sourceId ? { sourceId } : {}) });
  };
  const caution = (code: string, message: string, sourceId?: string) => {
    cautionReasons.push({ code, message, ...(sourceId ? { sourceId } : {}) });
  };

  if (!input.usable)
    block(
      'gauge_coverage_incomplete',
      'Current gauge coverage is stale, suspect, unrated or incomplete.',
    );
  if (!input.hasDuration)
    block('duration_unavailable', 'A usable trip duration is unavailable for this route.');
  if (!['good', 'flowing', 'low'].includes(input.conditionCode)) {
    block('water_conditions_unsuitable', `Route water conditions are ${input.conditionCode}.`);
  }
  if (input.lowSpanGauge)
    block('low_water_in_route', 'A gauge within the route is too low for a recommendation.');

  // Use the database's actual severity vocabulary, retaining legacy aliases.
  const severe = (hazard: Hazard) =>
    ['danger', 'high', 'severe', 'dangerous', 'extreme'].includes(
      hazard.severity?.toLowerCase() ?? '',
    );
  for (const hazard of [...input.hazards, ...input.unlocatedHazards]) {
    const unlocated = input.unlocatedHazards.includes(hazard);
    if (severe(hazard)) {
      block(
        unlocated ? 'danger_location_unknown' : 'danger_on_route',
        `${hazard.name}: recorded danger${unlocated ? '; its location cannot be excluded from this route' : ' on this route'}.`,
        hazard.id,
      );
    }
    if (hazard.portage_required) {
      // portage_side/description are not verified permission or a usable
      // bypass. Do not invent a safe portage from this flag alone.
      block(
        'portage_unverified',
        `${hazard.name}: a portage is required, but a usable, permitted bypass has not been verified.`,
        hazard.id,
      );
    } else if (!severe(hazard)) {
      caution(
        unlocated ? 'hazard_location_unknown' : 'recorded_hazard',
        `${hazard.name}: review the recorded hazard${unlocated ? '; its location is unknown' : ''}.`,
        hazard.id,
      );
    }
  }

  if (!input.alerts.checkedAllApplicable) {
    for (const source of input.alerts.sources.filter(
      (s) => s.status !== 'ok' && s.reasonCode !== 'not_applicable',
    )) {
      caution(
        'alert_source_incomplete',
        `${source.source}: ${source.reason || 'alert lookup failed or was incomplete'}. Verify official notices before launch.`,
      );
    }
  }
  for (const alert of input.alerts.alerts) {
    if (closureAffectsRoute(alert, input.riverName, input.endpointNames)) {
      block(
        'official_closure',
        `Official closure affecting this river or a selected endpoint: ${alert.title}`,
        alert.id,
      );
    } else if (
      /\bclosure\b/i.test(alert.category) ||
      alert.severity === 'warning' ||
      alert.severity === 'watch'
    ) {
      caution(
        'alert_scope_unverified',
        `${alert.title}: this regional or park notice has not been matched to the trip's exact stretch; verify its relevance.`,
        alert.id,
      );
    }
  }

  if (input.future && input.forecastUnsuitable)
    block(
      'forecast_unsuitable',
      'The requested date has a rated high, dangerous or too-low river forecast.',
    );
  if (input.future && !input.forecastComplete)
    caution(
      'forecast_incomplete',
      'A complete rated river forecast is unavailable for the requested date; recheck before launch.',
    );

  const recommendationStatus = blockingReasons.length
    ? ('not_recommended' as const)
    : cautionReasons.length
      ? ('conditional' as const)
      : ('candidate' as const);
  return { recommendationStatus, blockingReasons, cautionReasons };
}
