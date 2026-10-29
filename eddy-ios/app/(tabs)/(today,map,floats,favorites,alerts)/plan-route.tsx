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
  // Launches only: an access point that is no longer a float endpoint is gone
  // from this plan as surely as one that was removed.
  const usable = (id?: string) => data.accessPoints.find((point) => point.id === id && point.isFloatEndpoint !== false);
  // The link named a put-in or take-out the river's settled access list no
  // longer offers (a featured float cached for an hour, a removed launch). An
  // empty picker with no word about why read as the link failing. Shown until
  // the paddler picks or clears a river themselves, or completes a plan.
  const [noticeCleared, setNoticeCleared] = useState(false);
  const linkedStopGone = !noticeCleared && !planner.plan && !!data.river && data.slug === params.focusRiver &&
    data.accessSettled && !data.accessError &&
    Boolean((params.planPutIn && !usable(params.planPutIn)) || (params.planTakeOut && !usable(params.planTakeOut)));
  const notice = linkedStopGone && data.river
    ? `A stop in that float is no longer available on the ${data.river.name}. Choose another.`
    : null;
  useEffect(() => {
    if (consumed.current || closing.current || !data.river || data.accessLoading || data.accessError) return;
    if (data.slug !== params.focusRiver) return;
    const find = (id?: string) => data.accessPoints.find((point) => point.id === id && point.isFloatEndpoint !== false);
    const putIn = find(params.planPutIn);
    const takeOut = find(params.planTakeOut);
    const missing = (params.planPutIn && !putIn) || (params.planTakeOut && !takeOut);
    // A cached list may predate these endpoints; let the fresh response finish
    // the handoff unless the user has already chosen a different river.
    if (missing && !data.accessSettled) return;
    consumed.current = true;
    if (missing) {
      // Keep what still exists; the notice above says what does not.
      if (putIn) planner.choosePutIn(putIn);
      return;
    }
    if (putIn && takeOut) planner.planFloat(putIn, takeOut, params.planVesselTypeId);
    else if (putIn) planner.choosePutIn(putIn);
    else if (takeOut) planner.chooseTakeOut(takeOut);
  }, [data.river, data.slug, data.accessPoints, data.accessLoading, data.accessError, data.accessSettled, params, planner]);
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
          setNoticeCleared(true);
          data.setSlug(river.slug);
        }}
        onClearRiver={() => {
          consumed.current = true;
          setNoticeCleared(true);
          planner.reset();
          data.setSlug(null);
        }}
        notice={notice}
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
