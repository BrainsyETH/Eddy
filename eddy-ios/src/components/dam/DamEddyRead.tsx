// A concise interpretation, refreshed alongside the dam on focus, resume and
// five-minute boundaries. Prose expires at the hour and Central midnight.
// Members request their representation directly; no public-cache gate can
// hide an entitled answer. Account, content and timestamp are held together.

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDamRefresh } from '@/hooks/useDamRefresh';
import { useObservationClock } from '@/hooks/useObservationClock';
import { damReadFailure, damReadStillCurrent } from '@/lib/damReadFreshness';
import type { DamReadResponse } from '@eddy/types';
import { centralDayKey, relativeAgeShort } from '@eddy/conditions/dam-schedule-copy';
import { ApiError, fetchDamRead } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { ReadHeading } from '@/components/ReadHeading';
import { AppleSignInButton } from '@/components/AppleSignInButton';
import { BlurredProse, PremiumLockRow, ReadSkeleton } from '@/components/PremiumLock';

type Read = NonNullable<DamReadResponse['read']>;
type Premium =
  | { key: string; state: 'ready'; read: Read }
  | { key: string; state: 'unavailable' }
  | { key: string; state: 'sign-in' | 'premium' }
  | { key: string; state: 'failed' };

interface AccessActions {
  onUnlock: () => void;
  onRefreshAccount: () => Promise<void>;
}

/** The one-line pitch on the locked card. */
export const DAM_READ_LOCKED_COPY = 'What stands out in today’s generation schedule.';

/**
 * What the frost covers on a locked card. LENGTH, not content: the public
 * response carries no Read text, and nobody can read this — it gives the blur
 * a paragraph's shape instead of collapsing to a gap. EddyTake frosts the same
 * shape on a river's dam-release tab.
 */
export const LOCKED_DAM_READ_SHAPE =
  'Today’s posted schedule starts at noon, about two hours earlier than recent weekdays.';

function useDamRead(damId: string, premiumUserId: string | null, revision: number) {
  const { getAccessToken } = useSession();
  const clock = useObservationClock();
  const [held, setHeld] = useState<{
    key: string; generatedAt: string | null; renderedAt: number;
    current: Premium | null; failed: boolean;
  } | null>(null);
  // A response can arrive between minute ticks; its receipt is already current.
  const now = Math.max(clock, held?.renderedAt ?? 0);
  const key = `${premiumUserId}:${damId}:${centralDayKey(now)}`;
  const [retry, setRetry] = useState(0);
  useDamRefresh(useCallback((signal: AbortSignal) => {
    void (async () => {
      try {
        const token = premiumUserId ? await getAccessToken(premiumUserId) : null;
        if (signal.aborted) return;
        // A failed token refresh can mean no reception, not a revoked session.
        if (premiumUserId && !token) throw new ApiError('Could not reach your account');
        const data = await fetchDamRead(damId, signal, token);
        if (signal.aborted) return;
        const renderedAt = Date.now();
        const available = data.available && data.generatedAt && damReadStillCurrent(data.generatedAt, renderedAt, renderedAt);
        setHeld({ key, generatedAt: available ? data.generatedAt : null, renderedAt, failed: false,
          current: premiumUserId ? available && data.read
            ? { key, state: 'ready', read: data.read } : { key, state: 'unavailable' } : null });
      } catch (error) {
        if (signal.aborted) return;
        const failure = damReadFailure(error instanceof ApiError ? error.status : undefined);
        if (failure !== 'retry') {
          setHeld({ key, generatedAt: null, renderedAt: Date.now(), failed: false, current: { key, state: failure } });
          return;
        }
        setHeld(previous => previous?.key === key && previous.generatedAt &&
          damReadStillCurrent(previous.generatedAt, previous.renderedAt, Date.now())
          ? { ...previous, failed: true }
          : { key, generatedAt: null, renderedAt: Date.now(), failed: true, current: { key, state: 'failed' } });
      }
    })();
    // Revision and Retry explicitly ask for a new representation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damId, getAccessToken, key, premiumUserId, revision, retry]));
  const state = held?.key === key ? held : null;
  const fresh = state?.generatedAt && damReadStillCurrent(state.generatedAt, state.renderedAt, now);
  return {
    checked: Boolean(state),
    generatedAt: fresh ? state.generatedAt : null,
    current: state?.current?.state === 'ready' && !fresh ? null : state?.current ?? null,
    failed: state?.failed ?? false,
    retry: () => setRetry(n => n + 1),
  };
}

/** A member's Read, or the state of fetching it. */
function MemberRead({ current, onRetry, loadingLabel, onUnlock, onRefreshAccount }: {
  current: Premium | null;
  onRetry: () => void;
  loadingLabel: string;
} & AccessActions) {
  const { colors } = useTheme();

  if (current?.state === 'premium') {
    return <ReadOffer onUnlock={() => {
      // Reconcile the page's held account state as the Premium sheet opens.
      void onRefreshAccount().catch(() => {});
      onUnlock();
    }} />;
  }
  if (current?.state === 'sign-in') {
    return <View style={styles.read}>
      <Text style={[styles.body, { color: colors.textMuted }]}>Sign in again to read Eddy’s take.</Text>
      <AppleSignInButton onSignedIn={() => { void onRefreshAccount().then(onRetry, onRetry); }} />
    </View>;
  }

  if (current?.state === 'ready') {
    // An older API still supplies its schedule sentence. Keep it as body copy
    // while the server rolls out; never restore the oversized bold paragraph.
    const takeaway = current.read.takeaway ?? {
      headline: 'Today’s generation',
      summary: current.read.headline,
    };
    return (
      <View style={styles.read}>
        <Text accessibilityRole="header" style={[styles.headline, { color: colors.text }]}>{takeaway.headline}</Text>
        <Text style={[styles.body, { color: colors.textBody }]}>{takeaway.summary}</Text>
      </View>
    );
  }
  if (current?.state === 'unavailable') {
    return (
      <Text style={[styles.body, { color: colors.textMuted }]}>
        This Read is being updated for the latest schedule. Check back shortly.
      </Text>
    );
  }
  if (current?.state === 'failed') {
    return (
      <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry Eddy's Read" style={styles.retry}>
        <Text style={[styles.body, { color: colors.textMuted }]}>Couldn’t load this Read.</Text>
        <Text style={[styles.action, { color: colors.interactive }]}>Retry</Text>
      </Pressable>
    );
  }
  return <ReadSkeleton widths={[0.7, 1, 0.8]} label={loadingLabel} />;
}

function ReadOffer({ onUnlock }: Pick<AccessActions, 'onUnlock'>) {
  const { colors } = useTheme();
  return <View>
    <Text style={[styles.body, { color: colors.text }]}>{DAM_READ_LOCKED_COPY}</Text>
    <View style={styles.lockedProse}>
      <BlurredProse text={LOCKED_DAM_READ_SHAPE} color={colors.textMuted} style={styles.body} lines={2} />
    </View>
    <PremiumLockRow onPress={onUnlock} />
  </View>;
}

export function DamEddyRead({ damId, damName, premiumUserId, canUnlock, onUnlock, onRefreshAccount, revision = 0 }: {
  damId: string;
  damName: string;
  /** premiumReadUserId(...): set only for a verified, current-session member. */
  premiumUserId: string | null;
  /** canOfferReadPremium(...): true only for a settled, non-member account. */
  canUnlock: boolean;
  /** Bumped by the screen's "Try again". */
  revision?: number;
} & AccessActions) {
  const { colors, elevation } = useTheme();
  const { checked, generatedAt, current, failed, retry } = useDamRead(damId, premiumUserId, revision);
  const accessActions = { onUnlock, onRefreshAccount };

  if (checked && !generatedAt && !failed && current?.state === 'unavailable') return null;
  if (!premiumUserId && !generatedAt && !failed) return null;
  const age = generatedAt ? relativeAgeShort(generatedAt) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <ReadHeading />

      {failed && !generatedAt ? (
        <MemberRead {...accessActions} current={{ key: '', state: 'failed' }} onRetry={retry} loadingLabel="Loading Eddy’s Read" />
      ) : premiumUserId ? (
        <MemberRead {...accessActions} current={current} onRetry={retry} loadingLabel={`Loading Eddy's Read for ${damName}`} />
      ) : canUnlock ? (
        <ReadOffer onUnlock={onUnlock} />
      ) : (
        // An account not yet settled: reserve the space without either the
        // Read or an offer.
        <ReadSkeleton widths={[0.7, 1, 0.8]} label={`Loading Eddy's Read for ${damName}`} />
      )}

      {failed && generatedAt ? <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={[styles.action, { color: colors.interactive }]}>Couldn’t refresh · Retry</Text></Pressable> : null}
      {age ? <Text style={[styles.age, { color: colors.textSubtle }]}>Updated {age}</Text> : null}
    </View>
  );
}

/**
 * The dam's Read as the body of EddyTake's "Eddy's Read" section, on a river's
 * dam-release tab (shared/dam-release-tab.ts). For a verified member only:
 * EddyTake draws the locked and unsettled states itself, under its one lock.
 */
export function DamReadInTake({ damId, premiumUserId, onUnlock, onRefreshAccount, revision = 0 }: {
  damId: string;
  premiumUserId: string;
  revision?: number;
} & AccessActions) {
  const { colors } = useTheme();
  const { checked, generatedAt, current, failed, retry } = useDamRead(damId, premiumUserId, revision);
  const accessActions = { onUnlock, onRefreshAccount };

  if (!checked) return <ReadSkeleton label="Loading Eddy's Read for this dam" />;
  if (failed && !generatedAt) return <MemberRead {...accessActions} current={{ key: '', state: 'failed' }} onRetry={retry} loadingLabel="Loading Eddy’s Read" />;
  if (!generatedAt && current?.state === 'unavailable') {
    // Not "unavailable for this river": the dam may have no Read yet today,
    // or the schedule changed and the next hourly run has not rewritten it.
    return (
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Eddy&apos;s Read of this dam&apos;s schedule isn&apos;t ready right now. Check back shortly.
      </Text>
    );
  }
  const age = generatedAt ? relativeAgeShort(generatedAt) : null;
  return (
    <View style={styles.inTake}>
      <MemberRead {...accessActions} current={current} onRetry={retry} loadingLabel="Loading Eddy's Read for this dam" />
      {failed && generatedAt ? <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={[styles.action, { color: colors.interactive }]}>Couldn’t refresh · Retry</Text></Pressable> : null}
      {age ? <Text style={[styles.age, { color: colors.textSubtle }]}>Updated {age}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 12 },
  read: { gap: 6 },
  headline: { ...t.lg, fontFamily: fonts.heading, lineHeight: 24 },
  body: { ...t.base },
  lockedProse: { marginTop: 10 },
  inTake: { gap: 10, marginTop: 8 },
  retry: { gap: 4, minHeight: 44, justifyContent: 'center' },
  action: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  age: { ...t.xs },
});
