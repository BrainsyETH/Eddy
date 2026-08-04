// eddy-ios/src/components/map-sheet/RiverSheetPanel.tsx
// The river's tabs, in the same shell and on the same bar as a pin's.
//
// Separate from RiverSheet.tsx only so that file stays what it is — the tab
// bodies and the rules about which of them exist — while this one holds the
// state a tabbed sheet needs. Same division as PinSheet and AccessTabs.
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { MapAccessPoint } from '@eddy/types';
import { SheetTabBar } from './SheetTabBar';
import { SheetPager, mountedPages } from './SheetPager';
import {
  RiverAccessesTab,
  RiverConditionsTab,
  RiverFloatsTab,
  RiverHazardsTab,
  RiverSheetHeader,
} from './RiverSheet';
import { riverTabs, type RiverSheetData, type RiverTabKey } from './riverTabs';

interface Props {
  river: RiverSheetData;
  onClose: () => void;
  onOpenGauge: (siteId: string) => void;
  onOpenRiver: (slug: string) => void;
  onSelectAccess: (point: MapAccessPoint) => void;
  onPlanPair: (putIn: MapAccessPoint, takeOut: MapAccessPoint) => void;
  width: number;
}

export function RiverSheetPanel({ river, width, onClose, ...handlers }: Props) {
  const tabs = useMemo(() => riverTabs(river), [river]);
  // Held by key for the reason PinSheet documents: the set can change under the
  // reader as access points and hazards arrive for a newly selected river.
  const [chosen, setChosen] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const progress = useSharedValue(0);

  if (seededFor !== river.slug) {
    setSeededFor(river.slug);
    setChosen(null);
  }

  const activeKey = chosen && tabs.some((tab) => tab.key === chosen) ? chosen : tabs[0]?.key;
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === activeKey));
  const isMounted = mountedPages(activeIndex, tabs.length);

  const shared = { river, ...handlers };

  const renderTab = (key: RiverTabKey) => {
    if (key === 'conditions') return <RiverConditionsTab {...shared} />;
    if (key === 'floats') return <RiverFloatsTab {...shared} />;
    if (key === 'accesses') return <RiverAccessesTab {...shared} />;
    return <RiverHazardsTab {...shared} />;
  };

  return (
    <View>
      <RiverSheetHeader river={river} onClose={onClose} onOpenRiver={handlers.onOpenRiver} />
      {/* A river with no access points and no hazards is one tab, and one tab
          is not a tab bar. */}
      {tabs.length > 1 ? (
        <SheetTabBar
          labels={tabs.map((tab) => tab.label)}
          index={activeIndex}
          onSelect={(i) => setChosen(tabs[i]?.key ?? null)}
          progress={progress}
        />
      ) : null}
      <SheetPager
        count={tabs.length}
        index={activeIndex}
        onIndexChange={(i) => setChosen(tabs[i]?.key ?? null)}
        progress={progress}
        width={width}
      >
        {tabs.map((tab, i) => (
          <View key={tab.key} style={styles.page}>
            {isMounted(i) ? renderTab(tab.key) : null}
          </View>
        ))}
      </SheetPager>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16 },
});
