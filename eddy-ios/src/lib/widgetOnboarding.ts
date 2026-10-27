// A small, local-only discovery record. The widget gallery is owned by iOS:
// Eddy can explain how to add a widget but cannot install one itself.
// Neither an account nor notification permission is required.

export const WIDGET_ONBOARDING_KEY = 'eddy.widgets.setup-guide.seen.v1';
export type WidgetGuideKind = 'river' | 'lock' | 'favorites' | 'dam' | 'report';

export const WIDGET_GUIDE = {
  lock: {
    title: 'River level',
    size: 'Lock Screen',
    personalize: 'Tap the widget to choose a gauge, then tap Done.',
  },
  river: {
    title: 'River level',
    size: 'Small',
    personalize: 'Touch and hold the widget, tap Edit Widget, then choose a gauge.',
  },
  favorites: {
    title: 'Your rivers',
    size: 'Medium',
    personalize: 'Touch and hold the widget, then tap Edit Widget to choose gauges. Empty slots follow Favorites.',
  },
  dam: {
    title: 'Dam generation',
    size: 'Medium',
    personalize: 'Touch and hold the widget, tap Edit Widget, then choose a dam.',
  },
  report: {
    title: 'Daily River Report',
    size: 'Medium',
    personalize: 'Touch and hold the widget, tap Edit Widget, then choose a river.',
  },
} as const;

export function widgetGuide(kind: WidgetGuideKind, layoutVersion = 3) {
  if (kind === 'favorites' && layoutVersion < 2) return {
    ...WIDGET_GUIDE.favorites,
    personalize: 'Star rivers or gauges in Favorites. Your first three appear here.',
  };
  return WIDGET_GUIDE[kind];
}

export function widgetGuideSteps(kind: WidgetGuideKind, layoutVersion = 3) {
  const widget = widgetGuide(kind, layoutVersion);
  if (kind === 'lock') return [
    'Touch and hold your Lock Screen. Tap Customize, then Lock Screen.',
    'Tap Add Widgets, then Eddy. Choose the rectangular River level widget.',
    widget.personalize,
  ];
  return [
    'Touch and hold your Home Screen. Tap Edit, then Add Widget.',
    'Search Eddy, choose ' + widget.title + ', then tap Add Widget and Done.',
    widget.personalize,
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
