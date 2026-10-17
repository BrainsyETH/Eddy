// A small, local-only discovery record. The widget gallery is owned by iOS:
// Eddy can explain how to add a widget but cannot install one itself.
// Neither an account nor notification permission is required.

export const WIDGET_ONBOARDING_KEY = 'eddy.widgets.setup-guide.seen.v1';
export type WidgetGuideKind = 'river' | 'favorites' | 'dam' | 'report';

export const WIDGET_GUIDE = {
  river: {
    title: 'River level',
    size: 'Small',
    summary: 'One clear reading in CFS or FT, using the river’s rating unit.',
    personalize: 'Touch and hold the widget, tap Edit Widget, then choose the gauge or river you want to see.',
  },
  favorites: {
    title: 'Your rivers',
    size: 'Medium',
    summary: 'Choose three stations, or follow the first three rivers or gauges you star in Favorites.',
    personalize: 'Touch and hold, tap Edit Widget, then choose the first, second and third stations. Empty slots follow the first three distinct rivers or gauges in Favorites; explicit choices stay selected when you unstar them.',
  },
  dam: {
    title: 'Dam generation',
    size: 'Medium',
    summary: 'See turbine flow beside today’s hourly generation schedule.',
    personalize: 'Touch and hold the widget, tap Edit Widget, then choose a dam. Schedule times are Central Time and can change.',
  },
  report: {
    title: 'Daily River Report',
    size: 'Medium',
    summary: 'See a river’s current condition, observed trend and today’s weather forecast.',
    personalize: 'Touch and hold the widget, tap Edit Widget, then choose a river. Tap the report to open its river page.',
  },
} as const;

export function widgetGuide(kind: WidgetGuideKind, layoutVersion = 3) {
  if (kind === 'dam' && layoutVersion < 3) return {
    ...WIDGET_GUIDE.dam,
    summary: 'See observed turbine flow and the next posted schedule change at a dam.',
  };
  if (kind === 'river' && layoutVersion < 3) return {
    ...WIDGET_GUIDE.river,
    summary: 'Keep one river gauge in view. Choose the station after adding it.',
  };
  if (kind === 'favorites' && layoutVersion < 2) return {
    ...WIDGET_GUIDE.favorites,
    summary: 'See readings for the first three rivers or gauges you star in Favorites.',
    personalize: 'Star rivers or gauges in Eddy’s Favorites tab. This installed widget follows the first three distinct favorites in that order.',
  };
  return WIDGET_GUIDE[kind];
}

export function widgetGuideSteps(kind: WidgetGuideKind, layoutVersion = 3) {
  const widget = widgetGuide(kind, layoutVersion);
  return [
    {
      title: 'Open the widget gallery',
      detail: 'On your iPhone Home Screen, touch and hold an empty area. Tap Edit, then Add Widget.',
    },
    {
      title: 'Find Eddy',
      detail: 'Search for Eddy, choose the ' + widget.size.toLowerCase() + ' ' + widget.title + ' widget, then tap Add Widget and Done.',
    },
    {
      title: 'Make it yours',
      detail: widget.personalize,
    },
  ];
}

interface WidgetGuideStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function deviceStorage(): WidgetGuideStorage {
  // Delayed native import: older app binaries and web-side tests can import
  // this pure guide without attempting to load AsyncStorage at module scope.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as WidgetGuideStorage;
}

/** A failed read only costs an extra invitation, never a blocked Alerts tab. */
export async function hasSeenWidgetGuide(storage?: WidgetGuideStorage): Promise<boolean> {
  try {
    return (await (storage ?? deviceStorage()).getItem(WIDGET_ONBOARDING_KEY)) === 'seen';
  } catch {
    return false;
  }
}

/** Mark only that the guide was acknowledged, never claim a widget was installed. */
export async function markWidgetGuideSeen(storage?: WidgetGuideStorage): Promise<void> {
  await (storage ?? deviceStorage()).setItem(WIDGET_ONBOARDING_KEY, 'seen');
}
