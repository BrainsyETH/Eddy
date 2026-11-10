import type { RiverGuideSeed } from '../../lib/river-guide-seeds';
import bigPiney from './big-piney';
import bigRiver from './big-river';
import black from './black';
import bourbeuse from './bourbeuse';
import bryantCreek from './bryant-creek';
import buffalo from './buffalo';
import caddoRiver from './caddo-river';
import crookedCreek from './crooked-creek';
import elk from './elk';
import gasconade from './gasconade';
import james from './james';
import kingsRiver from './kings-river';
import mulberry from './mulberry';
import northForkWhite from './north-fork-white';
import springRiverMo from './spring-river-mo';
import springRiver from './spring-river';
import stFrancis from './st-francis';
import warEagleCreek from './war-eagle-creek';
import white from './white';

export const riverGuideSeeds: RiverGuideSeed[] = [
  bigPiney,
  bigRiver,
  black,
  bourbeuse,
  bryantCreek,
  buffalo,
  caddoRiver,
  crookedCreek,
  elk,
  gasconade,
  james,
  kingsRiver,
  mulberry,
  northForkWhite,
  springRiverMo,
  springRiver,
  stFrancis,
  warEagleCreek,
];

/** Guides for rivers below a dam. Kept apart from the October batch above,
 * whose tests pin its eighteen rivers and review date. */
export const tailwaterGuideSeeds: RiverGuideSeed[] = [white];

/** Everything the insert-only seed script may add. */
export const insertableGuideSeeds: RiverGuideSeed[] = [...riverGuideSeeds, ...tailwaterGuideSeeds];
