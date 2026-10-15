import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useCuratedGauges } from '@/hooks/useCuratedGauges';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { widgetConfiguration, widgetGaugeCatalog, type WidgetGaugeChoice } from '@/lib/conditionWidgets';
import { createStorageQueue } from '@/lib/storageQueue';

interface WidgetBridge {
  readWidgetConfiguration?: () => Promise<string | null>;
  setWidgetConfiguration?: (json: string) => Promise<void>;
}
// Old binaries and Expo Go must still launch after an OTA containing this UI.
let bridge: WidgetBridge | null = null;
try {
  if (Platform.OS === 'ios') bridge = requireOptionalNativeModule<WidgetBridge>('EddyLiveActivity');
} catch { /* Widgets are optional presentation, never an app-launch dependency. */ }
const supported = !!bridge?.readWidgetConfiguration && !!bridge?.setWidgetConfiguration;
const writes = createStorageQueue();

export function ConditionsWidgetSync() {
  const { starred, ready } = useStarredRivers();
  const { gauges } = useCuratedGauges(supported);
  const [cachedCatalog, setCachedCatalog] = useState<WidgetGaugeChoice[] | null>(null);
  useEffect(() => {
    if (!supported) return;
    let active = true;
    bridge!.readWidgetConfiguration!().then(json => {
      const cached = json ? JSON.parse(json) : null;
      if (active) setCachedCatalog(cached?.version === 1 && Array.isArray(cached.catalog) ? cached.catalog : []);
    }).catch(() => { if (active) setCachedCatalog([]); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!supported || !ready || cachedCatalog === null) return;
    // Cached metadata lets an offline unstar/account deletion reach the widget
    // immediately. Reading values are fetched by WidgetKit, not by React.
    const catalog = gauges === null ? cachedCatalog : widgetGaugeCatalog(gauges);
    const json = JSON.stringify(widgetConfiguration(catalog, starred));
    void writes.run(() => bridge!.setWidgetConfiguration!(json)).catch(() => {});
  }, [ready, starred, gauges, cachedCatalog]);
  return null;
}
