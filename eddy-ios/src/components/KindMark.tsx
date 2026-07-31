import { Ionicons } from '@expo/vector-icons';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';

export type KindMarkKind = 'river' | 'gauge' | 'access_point' | 'dam';

const KIND_SYMBOL: Partial<Record<KindMarkKind, EddySymbolName>> = {
  river: 'river',
  gauge: 'gauge',
  access_point: 'accessPoint',
  dam: 'dam',
};

const KIND_ICON: Record<KindMarkKind, React.ComponentProps<typeof Ionicons>['name']> = {
  river: 'water-outline',
  gauge: 'speedometer-outline',
  access_point: 'location-outline',
  dam: 'business-outline',
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
