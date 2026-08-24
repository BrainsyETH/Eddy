import { Ionicons } from '@expo/vector-icons';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';

export type KindMarkKind = 'river' | 'gauge' | 'access_point' | 'dam' | 'hazard' | 'service';

const KIND_SYMBOL: Partial<Record<KindMarkKind, EddySymbolName>> = {
  river: 'river',
  gauge: 'gauge',
  access_point: 'accessPoint',
  dam: 'dam',
  hazard: 'hazard',
  // One generic mark for the kind, not one per tier: a search row says "a
  // business on the river", and the callout it opens wears the tier's own
  // mark. The outfitter is the dominant tier and the one that reads as that.
  service: 'outfitter',
};

const KIND_ICON: Record<KindMarkKind, React.ComponentProps<typeof Ionicons>['name']> = {
  river: 'water-outline',
  gauge: 'speedometer-outline',
  access_point: 'location-outline',
  dam: 'business-outline',
  hazard: 'warning-outline',
  service: 'storefront-outline',
};

export const KIND_MARK_SIZE = 17;

export function KindMark({
  kind,
  color,
  size = KIND_MARK_SIZE,
}: {
  kind: KindMarkKind;
  color: string;
  size?: number;
}) {
  const symbol = KIND_SYMBOL[kind];
  return symbol ? (
    <EddySymbol name={symbol} size={size} />
  ) : (
    <Ionicons name={KIND_ICON[kind]} size={size} color={color} />
  );
}
