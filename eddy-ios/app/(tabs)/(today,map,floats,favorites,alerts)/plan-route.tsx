import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PlanSheet } from '@/components/PlanSheet';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { usePlannerData } from '@/hooks/usePlannerData';
import { useLocation } from '@/hooks/useLocation';

/** One sheet transition; no second Mapbox instance to load or tear down. */
export default function PlanRouteScreen() {
  const params = useLocalSearchParams<{
    focusRiver?: string;
    planPutIn?: string;
    planTakeOut?: string;
    planVesselTypeId?: string;
    planBoatType?: string;
  }>();
  const router = useRouter();
  const data = usePlannerData(params.focusRiver);
  const location = useLocation();
  const planner = useFloatPlan(data.river?.id ?? null, data.accessPoints, params.planBoatType);
  const [visible, setVisible] = useState(true);
  const closing = useRef(false);
  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current || closing.current || !data.river || data.accessLoading || data.accessError) return;
    if (data.slug !== params.focusRiver) return;
    const putIn = data.accessPoints.find((point) => point.id === params.planPutIn);
    const takeOut = data.accessPoints.find((point) => point.id === params.planTakeOut);
    // A cached list may predate these endpoints; let the fresh response finish
    // the handoff unless the user has already chosen a different river.
    if ((params.planPutIn && !putIn) || (params.planTakeOut && !takeOut)) return;
    consumed.current = true;
    if (putIn && takeOut) planner.planFloat(putIn, takeOut, params.planVesselTypeId);
    else if (putIn) planner.choosePutIn(putIn);
    else if (takeOut) planner.chooseTakeOut(takeOut);
  }, [data.river, data.slug, data.accessPoints, data.accessLoading, data.accessError, params, planner]);
  const close = useCallback(
    (reason?: 'started' | 'map') => {
      closing.current = reason === undefined;
      consumed.current = true;
      planner.reset(); // Abort a calculation immediately, including during dismissal.
      setVisible(false);
    },
    [planner],
  );
  const leave = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    if (router.canGoBack()) router.back();
    else router.replace('/float-home');
  }, [router]);
  return (
    <View style={{ flex: 1 }}>
      <PlanSheet
        visible={visible}
        onClose={close}
        onClosed={leave}
        replaceOnStart
        rivers={data.rivers}
        riversLoading={data.riversLoading}
        riversError={data.riversError}
        onRetryRivers={data.retry}
        river={data.river}
        riverDistances={null}
        onSelectRiver={(river) => {
          consumed.current = true;
          data.setSlug(river.slug);
        }}
        onClearRiver={() => {
          consumed.current = true;
          planner.reset();
          data.setSlug(null);
        }}
        riverLoading={data.accessLoading}
        accessError={data.accessError}
        onRetryAccess={data.retry}
        state={planner}
        accessPoints={data.accessPoints}
        userCoords={location.coords}
      />
    </View>
  );
}
