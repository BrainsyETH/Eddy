import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useCampingOverview } from '@/hooks/useCampingOverview';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useTheme } from '@/theme/ThemeProvider';
import { CampingSites } from './CampingSites';
function ResolveService({ serviceId }: { serviceId: string }) {
  const { data, error, loading, refresh } = useCampingOverview();
  const { colors } = useTheme();
  const row = data?.tracked.find((r) => r.serviceId === serviceId);
  if (row && data)
    return (
      <CampingSites
        facilityId={row.facilityId}
        date={data.horizon.startDate}
        bookingUrl={row.booking?.url}
      />
    );
  if (loading) return <ActivityIndicator color={colors.interactive} />;
  if (error)
    return (
      <Pressable
        onPress={refresh}
        accessibilityRole="button"
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.interactive }}>
          Couldn’t load camping. Retry
        </Text>
      </Pressable>
    );
  return (
    <Text style={{ color: colors.textMuted }}>
      Individual site availability is not tracked here.
    </Text>
  );
}
export function ServiceCampingSites({ serviceId }: { serviceId: string }) {
  const { features } = useAppConfig();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  if (!features.campingHeatmap) return null;
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.interactive }}>
          {open ? 'Hide campsite details' : 'Explore campsite details'}
        </Text>
      </Pressable>
      {open ? <ResolveService serviceId={serviceId} /> : null}
    </View>
  );
}
