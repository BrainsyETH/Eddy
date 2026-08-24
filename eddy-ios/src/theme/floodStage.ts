// eddy-ios/src/theme/floodStage.ts
// The NWS flood-stage visual language now lives in shared/flood-stage.ts
// (@eddy/conditions), because both platforms draw these lines: the violet and
// the four-category ramp lived only on the phone while the website drew
// nothing, so one station could show an official flood category on one surface
// and a bare chart on the other. This file stays so the app's import paths —
// and the theme-directory reading order described in conditions.ts and
// flow.ts — survive the move.

export {
  FLOOD_STAGE_ORDER,
  FLOOD_STAGE_SYSTEM,
  floodStageColor,
  floodStageLabel,
  formatStage,
  highestStagePassed,
} from '@eddy/conditions/flood-stage';
export type { FloodStageKey } from '@eddy/conditions/flood-stage';
