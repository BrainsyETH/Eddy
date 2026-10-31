import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { fetchVesselTypes } from '@/api/client';
import { ControlIcon } from '@/components/ControlIcon';
import { vesselSpeedInfo } from '@/lib/vesselTypes';
import { useTheme } from '@/theme/ThemeProvider';

export function VesselSpeedTip() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const open = async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    let message: string;
    try {
      message = vesselSpeedInfo(await fetchVesselTypes());
    } catch {
      message = 'Vessel speeds couldn’t load. Please try again.';
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
    if (mounted.current) Alert.alert('Vessel speeds', message, [{ text: 'Got it' }]);
  };
  return <Pressable accessibilityRole="button" accessibilityLabel="About vessel speeds"
    accessibilityState={{ busy: loading, disabled: loading }} disabled={loading}
    onPress={() => void open()} style={styles.button}>
    {loading ? <ActivityIndicator size="small" color={colors.textMuted} />
      : <ControlIcon name="information-circle-outline" size={18} color={colors.textMuted} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
