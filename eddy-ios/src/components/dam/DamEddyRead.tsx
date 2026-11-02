// src/components/dam/DamEddyRead.tsx
// Eddy's Read on the dam screen. Premium in its entirety (ADR 0017).
//
// Two requests, kept apart the way the gauge screen keeps them: the public one
// says whether a Read exists today and when it was written, which is all a
// non-subscriber's locked card needs; the Premium one, sent only for an
// entitlement verified for THIS session's user, carries the Read itself:
// headline, story, the facts behind it, and the recent pattern details.
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
import type { DamReadResponse, DamReadRow } from '@eddy/types';
import { ApiError, fetchDamRead } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { writtenAge } from '@/lib/eddySays';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';
import { ControlIcon } from '@/components/ControlIcon';
import { BlurredProse, PremiumLockRow, ReadSkeleton } from '@/components/PremiumLock';

type Read = NonNullable<DamReadResponse['read']>;
type Premium =
  | { key: string; state: 'ready'; read: Read }
  | { key: string; state: 'unavailable' }
  | { key: string; state: 'failed' };

/** The one-line pitch on the locked card. */
export const DAM_READ_LOCKED_COPY = 'Today’s generation schedule, recent patterns, and how closely the schedule has held.';

/**
 * What the frost covers on a locked card. LENGTH, not content: the public
 * response carries no Read text, and nobody can read this — it gives the blur
 * a paragraph's shape instead of collapsing to a gap.
 */
const LOCKED_DAM_READ_SHAPE =
  'Generation is scheduled through the afternoon, close to the last few days. The posted schedule has mostly held this week, so expect the water to rise on time.';

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
  const { getAccessToken } = useSession();

  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [premium, setPremium] = useState<Premium | null>(null);
  const [retry, setRetry] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
        setGeneratedAt(available);
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

  if (!generatedAt) return null;
  // Held across a refresh so a focus never blanks a Read already on screen.
  const current = premiumUserId && premium?.key === key ? premium : null;
  const age = writtenAge(generatedAt);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <Text style={[styles.kicker, { color: colors.textMuted }]}>EDDY&apos;S READ</Text>

      {current?.state === 'ready' ? (
        <View style={styles.read}>
          {/* Reading order (ADR 0017): today, then what it means, then the
              evidence, then the full breakdown for anyone who wants it. */}
          <Text style={[styles.headline, { color: colors.text }]}>{current.read.headline}</Text>
          {current.read.mayBeOutdated ? (
            <Text style={[styles.caveat, { color: colors.textMuted }]}>Eddy&apos;s copy of today&apos;s schedule may be out of date.</Text>
          ) : null}
          <Text style={[styles.body, { color: colors.text }]}>{current.read.story.join(' ')}</Text>
          {current.read.keyRows.length ? <FactRows rows={current.read.keyRows} /> : null}
          {current.read.detailRows.length ? (
            <View style={styles.details}>
              <Pressable
                onPress={() => setDetailsOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsOpen }}
                hitSlop={8}
                style={styles.detailsToggle}
              >
                <Text style={[styles.action, { color: colors.interactive }]}>Recent pattern details</Text>
                <ControlIcon name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.interactive} />
              </Pressable>
              {detailsOpen ? <FactRows rows={current.read.detailRows} /> : null}
            </View>
          ) : null}
          <Text style={[styles.caveat, { color: colors.textMuted }]}>{current.read.caveat}</Text>
        </View>
      ) : current?.state === 'unavailable' ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>
          This Read is being updated for the latest schedule. Check back shortly.
        </Text>
      ) : current?.state === 'failed' ? (
        <Pressable onPress={() => setRetry((n) => n + 1)} accessibilityRole="button" accessibilityLabel="Retry Eddy's Read" style={styles.retry}>
          <Text style={[styles.body, { color: colors.textMuted }]}>Couldn’t load this Read.</Text>
          <Text style={[styles.action, { color: colors.interactive }]}>Retry</Text>
        </Pressable>
      ) : canUnlock ? (
        <View>
          <Text style={[styles.body, { color: colors.text }]}>{DAM_READ_LOCKED_COPY}</Text>
          <View style={styles.lockedProse}>
            <BlurredProse text={LOCKED_DAM_READ_SHAPE} color={colors.textMuted} style={styles.body} lines={3} />
          </View>
          <PremiumLockRow onPress={onUnlock} />
        </View>
      ) : (
        // A member's Read in flight, or an account not yet settled: reserve the
        // space without either the Read or an offer.
        <ReadSkeleton label={`Loading Eddy's Read for ${damName}`} />
      )}

      {age ? <Text style={[styles.age, { color: colors.textMuted }]}>{age}</Text> : null}
    </View>
  );
}

/** Label on the left, value on the right, qualifier underneath. */
function FactRows({ rows }: { rows: DamReadRow[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.rows}>
      {rows.map((row) => (
        <View key={row.key} style={styles.row} accessible accessibilityLabel={`${row.label}: ${row.value}${row.detail ? `. ${row.detail}` : ''}`}>
          <View style={styles.rowLine}>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{row.label}</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{row.value}</Text>
          </View>
          {row.detail ? <Text style={[styles.rowDetail, { color: colors.textSubtle }]}>{row.detail}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 10 },
  kicker: { fontFamily: fonts.heading, fontSize: 12, letterSpacing: 0.7 },
  read: { gap: 12 },
  headline: { ...textStyles.cardTitle },
  rows: { gap: 8 },
  details: { gap: 8 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  row: { gap: 1 },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  rowLabel: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  rowValue: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, textAlign: 'right', flexShrink: 1 },
  rowDetail: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, textAlign: 'right' },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  caveat: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  lockedProse: { marginTop: 10 },
  retry: { gap: 4, minHeight: 44, justifyContent: 'center' },
  action: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  age: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
});
