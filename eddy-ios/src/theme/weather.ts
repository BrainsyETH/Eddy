import { neutral, primary, secondary, type Palette } from './palette';

/** Weather hues describe the sky; they are independent of river safety bands. */
export function weatherIconPalette(isDark: boolean) {
  return isDark
    ? { sun: '#FFC857', moon: '#F5E6B3', cloud: '#CED7DF', edge: '#A5B4C1', rain: '#68BEFF', snow: '#BBE8FF', lightning: '#FFCA5C' }
    : { sun: '#DB8700', moon: '#A67C32', cloud: '#A3B3C2', edge: '#64798B', rain: '#237AC1', snow: '#397DA3', lightning: '#C97A00' };
}

export function weatherSymbol(code: string) {
  const night = code.endsWith('n');
  const kind = code.slice(0, 2);
  return { night, kind, sun: !night && ['01', '02', '10'].includes(kind),
    moon: night && ['01', '02', '10'].includes(kind), cloud: kind !== '01',
    rain: ['09', '10'].includes(kind), storm: kind === '11', snow: kind === '13', mist: kind === '50' };
}

export function weatherDescription(code: string): string {
  if (code.startsWith('01')) return 'Clear';
  if (code.startsWith('02')) return 'Partly cloudy';
  if (/^(09|10)/.test(code)) return 'Rain';
  if (code.startsWith('11')) return 'Thunderstorms';
  if (code.startsWith('13')) return 'Snow';
  if (code.startsWith('50')) return 'Mist';
  return 'Cloudy';
}

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

/** Match Will it hold?'s rain buckets (river-outlook.ts), including dark mode. */
export function rainChanceColor(chance: number, colors: Palette): string {
  if (chance >= 70) return colors.rainHeavy;
  if (chance >= 20) return colors.rainLikely;
  return colors.rainQuiet;
}
