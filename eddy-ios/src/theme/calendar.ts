import type { Palette } from './palette';

export type CalendarDayState = 'endpoint' | 'range' | 'available' | 'unavailable';

/** Endpoints are solid markers; a range has its own fill, ink and outline. */
export function calendarDayColors(colors: Palette, state: CalendarDayState) {
  const endpoint = state === 'endpoint';
  const selected = endpoint || state === 'range';
  return {
    backgroundColor: endpoint ? colors.interactive : selected ? colors.selectionBg : 'transparent',
    borderColor: selected ? colors.interactive : 'transparent',
    color: endpoint ? colors.onInteractive : selected ? colors.selectionText
      : state === 'available' ? colors.text : colors.textSubtle,
  };
}
