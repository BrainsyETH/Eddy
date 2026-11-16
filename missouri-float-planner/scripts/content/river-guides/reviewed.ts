import type { RiverGuideSeed } from '../../lib/river-guide-seeds';
import { riverGuideSeeds, tailwaterGuideSeeds } from './index';
import current from './current';
import jacks_fork from './jacks-fork';
import eleven_point from './eleven-point';
import meramec from './meramec';
import huzzah from './huzzah';
import courtois from './courtois';
import niangua from './niangua';

export const reviewedRiverGuides: RiverGuideSeed[] = [
  current, jacks_fork, eleven_point, meramec, huzzah, courtois, niangua,
  ...riverGuideSeeds,
  ...tailwaterGuideSeeds,
];
