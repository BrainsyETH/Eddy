// src/components/dam/DamEddyRead.tsx
// Eddy's Read on the dam screen. Premium in its entirety (ADR 0017).
//
// Two requests, kept apart the way the gauge screen keeps them: the public one
// says whether a Read exists today and when it was written, which is all a
// non-subscriber's locked card needs; the Premium one, sent only for an
// entitlement verified for THIS session's user, carries the Read itself:
// a short headline and one interpretation sentence. The schedule and pattern
// chart around this card carry the data and its timing/freshness information.
//
// ── Refreshed with the screen ──────────────────────────────────────────────
// Both requests run on every focus, not only on mount: the dam screen
// re-reads its schedule each time it is focused, and a Read fetched once would
// sit beside a newer schedule, or carry yesterday's "today" into the morning.
// The server re-renders the rows against the schedule posted now, so a fresh
// request is all it takes to keep the two in step.
//
// ── Every state is drawn ───────────────────────────────────────────────────
// Non-member: the same locked presentation as the river and gauge Read
// (PremiumLock.tsx) — frosted prose, then ONE lock row. No padlock in the
// header and no second link: one lock per Read. Unknown account, or a member's
// Read in flight: the loading skeleton, never a sales offer (the rules in
// readPremiumAccess.ts) and never the frost, which means "locked". Member, Read
// withheld since the public check (the schedule changed and the next hourly run
// has not rewritten it): a plain "being updated" line, never an indefinite
// placeholder. Failed request: retry.
//
// The measured pattern strip and the posted schedule on this screen stay free;
// they are the whole of the data the Read interprets.

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { DamReadResponse } from '@eddy/types';
import { relativeAgeShort } from '@eddy/conditions/dam-schedule-copy';
import { ApiError, fetchDamRead } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';
import { BlurredProse, PremiumLockRow, ReadSkeleton } from '@/components/PremiumLock';

type Read = NonNullable<DamReadResponse['read']>;
type Premium =
  | { key: string; state: 'ready'; read: Read }
  | { key: string; state: 'unavailable' }
  | { key: string; state: 'failed' };

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

/**
 * Both requests, re-run on every focus. `checked` is false until the public
 * request for THIS dam has answered, so a tab switch never shows the last
 * dam's state.
 */
function useDamRead(damId: string, premiumUserId: string | null, revision: number) {
  const { getAccessToken } = useSession();
  const [publicState, setPublicState] = useState<{ damId: string; generatedAt: string | null } | null>(null);
  const [premium, setPremium] = useState<Premium | null>(null);
  const [retry, setRetry] = useState(0);
  // The user is part of the key: Premium prose never crosses accounts.
  const key = `${premiumUserId}:${damId}`;

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      void (async () => {
        let available: string | null = null;
        try {
          const data = await fetchDamRead(damId, controller.signal);
          available = data.available ? data.generatedAt : null;
        } catch {
          available = null;
        }
        if (controller.signal.aborted) return;
        setPublicState({ damId, generatedAt: available });
        if (!available || !premiumUserId) return;

        try {
          const token = await getAccessToken();
          if (!token) throw new ApiError('No active session', 401);
          const data = await fetchDamRead(damId, controller.signal, token);
          if (controller.signal.aborted) return;
          setPremium(data.available && data.read
            ? { key, state: 'ready', read: data.read }
            : { key, state: 'unavailable' });
        } catch {
          if (!controller.signal.aborted) setPremium({ key, state: 'failed' });
        }
      })();
      return () => controller.abort();
    // `revision` and `retry` are re-run triggers: "Try again" and Retry refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [damId, getAccessToken, key, premiumUserId, revision, retry]),
  );

  const checked = publicState?.damId === damId;
  return {
    checked,
    generatedAt: checked ? publicState?.generatedAt ?? null : null,
    // Held across a refresh so a focus never blanks a Read already on screen.
    current: premiumUserId && premium?.key === key ? premium : null,
    retry: () => setRetry((n) => n + 1),
  };
}

/** A member's Read, or the state of fetching it. */
function MemberRead({ current, onRetry, loadingLabel }: {
  current: Premium | null;
  onRetry: () => void;
  loadingLabel: string;
}) {
  const { colors } = useTheme();

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

export function DamEddyRead({ damId, damName, premiumUserId, canUnlock, onUnlock, revision = 0 }: {
  damId: string;
  damName: string;
  /** premiumReadUserId(...): set only for a verified, current-session member. */
  premiumUserId: string | null;
  /** canOfferReadPremium(...): true only for a settled, non-member account. */
  canUnlock: boolean;
  onUnlock: () => void;
  /** Bumped by the screen's "Try again". */
  revision?: number;
}) {
  const { colors, elevation } = useTheme();
  const { generatedAt, current, retry } = useDamRead(damId, premiumUserId, revision);

  if (!generatedAt) return null;
  const age = relativeAgeShort(generatedAt);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.header}>
        <Otter mood="favicon" size={28} />
        <Text style={[styles.kicker, { color: colors.interactive }]}>Eddy&apos;s Read</Text>
      </View>

      {premiumUserId ? (
        <MemberRead current={current} onRetry={retry} loadingLabel={`Loading Eddy's Read for ${damName}`} />
      ) : canUnlock ? (
        <View>
          <Text style={[styles.body, { color: colors.text }]}>{DAM_READ_LOCKED_COPY}</Text>
          <View style={styles.lockedProse}>
            <BlurredProse text={LOCKED_DAM_READ_SHAPE} color={colors.textMuted} style={styles.body} lines={2} />
          </View>
          <PremiumLockRow onPress={onUnlock} />
        </View>
      ) : (
        // An account not yet settled: reserve the space without either the
        // Read or an offer.
        <ReadSkeleton widths={[0.7, 1, 0.8]} label={`Loading Eddy's Read for ${damName}`} />
      )}

      {age ? <Text style={[styles.age, { color: colors.textSubtle }]}>Updated {age}</Text> : null}
    </View>
  );
}

/**
 * The dam's Read as the body of EddyTake's "Eddy's Read" section, on a river's
 * dam-release tab (shared/dam-release-tab.ts). For a verified member only:
 * EddyTake draws the locked and unsettled states itself, under its one lock.
 */
export function DamReadInTake({ damId, premiumUserId, revision = 0 }: {
  damId: string;
  premiumUserId: string;
  revision?: number;
}) {
  const { colors } = useTheme();
  const { checked, generatedAt, current, retry } = useDamRead(damId, premiumUserId, revision);

  if (!checked) return <ReadSkeleton label="Loading Eddy's Read for this dam" />;
  if (!generatedAt) {
    // Not "unavailable for this river": the dam may have no Read yet today,
    // or the schedule changed and the next hourly run has not rewritten it.
    return (
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Eddy&apos;s Read of this dam&apos;s schedule isn&apos;t ready right now. Check back shortly.
      </Text>
    );
  }
  const age = relativeAgeShort(generatedAt);
  return (
    <View style={styles.inTake}>
      <MemberRead current={current} onRetry={retry} loadingLabel="Loading Eddy's Read for this dam" />
      {age ? <Text style={[styles.age, { color: colors.textSubtle }]}>Updated {age}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { ...t.lg, fontFamily: fonts.display, flexShrink: 1 },
  read: { gap: 6 },
  headline: { ...t.lg, fontFamily: fonts.heading, lineHeight: 24 },
  body: { ...t.base },
  lockedProse: { marginTop: 10 },
  inTake: { gap: 10, marginTop: 8 },
  retry: { gap: 4, minHeight: 44, justifyContent: 'center' },
  action: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  age: { ...t.xs },
});
