// Run from the existing Remotion installation with node --import tsx.
import { writeFileSync } from 'node:fs';
import { REEL_SAFE, SURFACES, CARD, TYPE, colors } from '../../../missouri-float-planner/shared/social-brand.ts';
if (!process.argv[2]) throw new Error('Pass the output theme.json path.');
writeFileSync(process.argv[2], JSON.stringify({
  safe: REEL_SAFE, surface: SURFACES.light, card: CARD,
  accent: colors.accent[500], type: TYPE,
}, null, 2));
