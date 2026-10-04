import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TodayScreen } from '@/screens/TodayScreen';
import { readFilterFromParam } from '@/lib/todayNavigation';
import { useAccount } from '@/hooks/useAccount';
import { useSession } from '@/hooks/useSession';
import { canOfferReadPremium, premiumReadUserId } from '@/lib/readPremiumAccess';
import { PaywallSheet } from '@/components/PaywallSheet';
import { onForeground } from '@/lib/foreground';

export default function EddyReadsScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string | string[] }>();
  const account = useAccount();
  const { session, ready } = useSession();
  const state = { sessionReady: ready, userId: session?.user.id ?? null,
    loaded: account.loaded, error: account.error, profileId: account.profile?.id ?? null,
    isActive: account.entitlement?.isActive ?? false };
  const premiumUserId = premiumReadUserId(state);
  const canUnlock = canOfferReadPremium(state);
  const [paywallRiver, setPaywallRiver] = useState<string | null>(null);
  const { refresh } = account;
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focusedOnce.current) void refresh();
    focusedOnce.current = true;
  }, [refresh]));
  useEffect(() => onForeground(() => { void refresh(); }), [refresh]);
  // Discard a pending offer as soon as entitlement resolves, including restores.
  if (premiumUserId && paywallRiver !== null) setPaywallRiver(null);
  return <>
    <TodayScreen browseMode="reads" initialReadFilter={readFilterFromParam(filter)}
      readAccess={{ premiumUserId, error: account.error, refresh,
        onUnlock: canUnlock ? setPaywallRiver : undefined }} />
    <PaywallSheet visible={paywallRiver !== null && canUnlock} riverName={paywallRiver ?? undefined}
      onClose={() => setPaywallRiver(null)} onPurchased={() => { setPaywallRiver(null); void refresh(); }} />
  </>;
}
