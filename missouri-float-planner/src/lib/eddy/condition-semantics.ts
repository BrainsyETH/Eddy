// src/lib/eddy/condition-semantics.ts
// How "low" and "rising" water should be described, per hydrological archetype.
//
// Lives in its own SDK-free module — like parse-response.ts — so it stays unit
// testable. generate-update.ts re-exports it; callers already import it there.

import type { RiverContext, RiverType } from '@/lib/rivers/context';

// Condition semantics per hydrological archetype (rivers.river_type, or
// river_sections.river_type for a reach that differs).
// The spring_fed_float text matches the original Ozark-calibrated prompt.
// SAFETY: never reuse one type's wording for another — "low" and "rising"
// mean physically different things on different river types. New types must
// be reviewed against local ground truth before any river of that type
// goes live.
export const RIVER_TYPE_GUIDANCE: Record<RiverType, { lowWater: string; risingWater: string }> = {
  spring_fed_float: {
    lowWater:
      'The river IS floatable. Low water means scraping on gravel bars, dragging over shallow spots, and picking your line through riffles. Frame this as practical information, not a reason to stay home. Mention that lighter craft (kayaks, canoes) handle low water better than rafts. Do NOT say "too low to run," "wait for rain," or recommend against floating when the condition code is "low." That language is reserved for "too_low" only.',
    risingWater:
      'Explain what rising water means for hazards — stronger current, more debris, undercut banks, strainers harder to avoid. Rising water after dry conditions could mean incoming flooding upstream.',
  },
  dam_tailwater: {
    lowWater:
      'Low flow on a dam-controlled river usually reflects the release schedule, not drought. Note that levels can change quickly and substantially when releases start, independent of local weather. Do not connect flow changes to rain unless the data explicitly supports it.',
    risingWater:
      'Rising water on a dam-controlled river can be a scheduled release arriving as a fast-moving rise, with strong current and rapidly changing depth. Warn paddlers to check the release schedule and never anchor or wade mid-channel during a rise.',
  },
  rain_flashy: {
    lowWater:
      'Low water on this river reflects how quickly it drains after rain. Frame low conditions honestly and note that a single storm can change conditions within hours.',
    risingWater:
      'This river rises fast. Rising water here deserves strong caution: flash rises, powerful current, and debris. If heavy rain is upstream, conditions can become dangerous before the gauge fully shows it.',
  },
  snowmelt: {
    lowWater:
      'Low flow typically means the melt has tapered. Note cold water temperatures remain a hazard even at low flows.',
    risingWater:
      'Rising water on a snowmelt river often follows warm days with a diurnal pattern (afternoon/evening peaks) and means cold, powerful current. Emphasize cold-water risk and rapid daily swings.',
  },
  flatwater: {
    lowWater:
      'Low water mainly affects paddling speed and exposed banks rather than runnability. Wind is usually the bigger factor on flatwater — weigh it accordingly.',
    risingWater:
      'Rising water increases current and debris. On big flatwater rivers, note that wakes, wind against current, and floating debris are the practical hazards.',
  },
};

/**
 * Per-river condition semantics (region + how "low"/"rising" water should be
 * framed). Lifted out of the system prompt into the user turn so the system
 * prompt can stay static and cacheable.
 *
 * `sectionRiverType` is the reach's own hydrology from river_sections.river_type
 * (migration 00204), or null to inherit the river's.
 */
export function buildConditionSemantics(
  riverCtx: RiverContext | null,
  sectionRiverType: RiverType | null = null,
): string {
  // A reach that declares its own hydrology outranks the river's. This is the
  // dam case: the Black is spring_fed_float, but everything below Clearwater Dam
  // is a tailwater and must not be described as rain-driven.
  const riverType: RiverType = sectionRiverType ?? riverCtx?.riverType ?? 'spring_fed_float';
  const guidance = RIVER_TYPE_GUIDANCE[riverType] ?? RIVER_TYPE_GUIDANCE.spring_fed_float;

  // SAFETY: river_characteristics prose is written about the river as a whole —
  // on the Black, about the spring-fed float out of Lesterville. Where a reach
  // overrides the type it is by definition the reach that prose does not
  // describe, so the type guidance must stand alone. Letting the prose through
  // here would silently restore spring-fed "low water means scraping" wording on
  // a tailwater that can rise several feet on a release, with the river_type
  // column still reading dam_tailwater. The override is only as good as this
  // line.
  const useRiverProse = sectionRiverType === null;

  // Per-river overrides beat the type default (both are curated data).
  const lowWater = useRiverProse && riverCtx?.characteristics?.lowWaterMeaning
    ? `The river IS floatable unless the code is "too_low". On this river, low water means: ${riverCtx.characteristics.lowWaterMeaning} Do NOT recommend against floating when the condition code is "low"; that language is reserved for "too_low" only.`
    : guidance.lowWater;
  const risingWater = useRiverProse && riverCtx?.characteristics?.risingWaterHazards
    ? `Explain what rising water means for hazards on this river: ${riverCtx.characteristics.risingWaterHazards}`
    : guidance.risingWater;
  const regionLabel = riverCtx?.region || 'Ozarks';

  return [
    `Region: ${regionLabel}`,
    `LOW WATER GUIDANCE: ${lowWater}`,
    `RISING WATER GUIDANCE: ${risingWater}`,
  ].join('\n');
}
