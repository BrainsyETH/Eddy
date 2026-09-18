import { neutral, primary, secondary } from './palette';

/** A quiet sky tint for the hero, using the same palette as the rest of Eddy. */
export function weatherAtmosphere(isDark: boolean, icon: string): readonly [string, string] {
  const night = icon.endsWith('n');
  const wet = /^(09|10|11)/.test(icon);
  if (isDark) {
    if (night) return [primary[900], neutral[950]];
    if (wet) return [primary[800], neutral[900]];
    return [primary[800], primary[900]];
  }
  if (night) return [primary[100], neutral[100]];
  if (wet) return [neutral[200], primary[50]];
  return [primary[100], secondary[100]];
}
