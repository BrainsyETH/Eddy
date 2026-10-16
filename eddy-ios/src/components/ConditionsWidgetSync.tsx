import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useCuratedGauges } from '@/hooks/useCuratedGauges';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { widgetConfiguration, widgetGaugeCatalog, type WidgetGaugeChoice } from '@/lib/conditionWidgets';
import { createStorageQueue } from '@/lib/storageQueue';
import { onForeground } from '@/lib/foreground';

interface WidgetBridge {
  readWidgetConfiguration?: () => Promise<string | null>;
  setWidgetConfiguration?: (json: string) => Promise<void>;
  refreshConditionsWidgets?: () => Promise<string>;
  readWidgetDiagnostics?: () => Promise<string>;
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
  const catalogReady = cachedCatalog !== null;
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
  useEffect(() => {
    if (!supported || !ready || !catalogReady || !bridge?.refreshConditionsWidgets) return;
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      // Read BEFORE asking WidgetKit to reload: an absence of recent attempts
      // indicates a deferred timeline; attempts with failures identify API/network.
      if (__DEV__ && bridge?.readWidgetDiagnostics) {
        void bridge.readWidgetDiagnostics().then(json => {
          console.info('[widgets] previous fetch diagnostics', JSON.parse(json));
        }).catch(() => {});
      }
      void bridge!.refreshConditionsWidgets!().then(result => {
        if (__DEV__) console.info('[widgets] foreground reload', result);
      }).catch(() => {});
    };
    refresh(); // an already-active cold launch has no foreground transition
    return onForeground(refresh);
  }, [ready, catalogReady]);
  return null;
}
