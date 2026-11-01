// src/components/dam/DamEddyRead.tsx
// Eddy's Read on the dam screen. Premium in its entirety (ADR 0017).
//
// Two requests, kept apart the way the gauge screen keeps them: the public one
// says whether a Read exists today and when it was written, which is all a
// non-subscriber's locked card needs; the Premium one, sent only for an
// entitlement verified for THIS session's user, carries the prose. Nothing
// renders until the public answer says a Read is available, so a dam without
// one draws no card, and a Read withheld because the schedule changed
// disappears rather than lingering.
//
// The three states come from readPremiumAccess.ts, the same rules the Today
// rail and the Reads list use: prose only for `premiumUserId`, an offer only
// when `canUnlock`, and a neutral blurred preview while either is unknown, so
// a loading or switching account never flashes a sales offer at a member.
//
// The measured pattern strip and the posted schedule on this screen stay free;
// they are the whole of the data the Read interprets.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DamReadResponse } from '@eddy/types';
import { ApiError, fetchDamRead } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { writtenAge } from '@/lib/eddySays';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';
import { ControlIcon } from '@/components/ControlIcon';
import { BlurredReadPreview } from '@/components/EddyReadCard';

type Prose = NonNullable<DamReadResponse['read']>;

export function DamEddyRead({ damId, damName, premiumUserId, canUnlock, onUnlock, revision = 0 }: {
  damId: string;
  damName: string;
  /** premiumReadUserId(...): set only for a verified, current-session member. */
  premiumUserId: string | null;
  /** canOfferReadPremium(...): true only for a settled, non-member account. */
  canUnlock: boolean;
  onUnlock: () => void;
  /** Bumped by the screen's pull-to-refresh. */
  revision?: number;
}) {
  const { colors, elevation } = useTheme();
  const { getAccessToken } = useSession();

  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [prose, setProse] = useState<{ key: string; read: Prose | null; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  // The user is part of the key: Premium prose never crosses accounts.
  const key = `${premiumUserId}:${damId}:${revision}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    fetchDamRead(damId, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setGeneratedAt(data.available ? data.generatedAt : null); })
      .catch(() => { if (!controller.signal.aborted) setGeneratedAt(null); });
    return () => controller.abort();
  }, [damId, revision]);

  useEffect(() => {
    if (!premiumUserId || !generatedAt) return;
    const controller = new AbortController();
    void (async () => {
      const token = await getAccessToken();
      if (!token) throw new ApiError('No active session', 401);
      return fetchDamRead(damId, controller.signal, token);
    })()
      .then((data) => { if (!controller.signal.aborted) setProse({ key, read: data.available ? data.read : null, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setProse({ key, read: null, failed: true }); });
    return () => controller.abort();
  }, [damId, generatedAt, getAccessToken, key, premiumUserId]);

  if (!generatedAt) return null;
  const current = premiumUserId && prose?.key === key ? prose : null;
  const age = writtenAge(generatedAt);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: colors.textMuted }]}>EDDY&apos;S READ</Text>
        {!premiumUserId ? <ControlIcon name="lock-closed" size={14} color={colors.textMuted} /> : null}
      </View>

      {current?.read ? (
        <View style={styles.prose}>
          <Text style={[styles.summary, { color: colors.text }]}>{current.read.summaryText}</Text>
          <Text style={[styles.body, { color: colors.text }]}>{current.read.quoteText}</Text>
        </View>
      ) : current?.failed ? (
        <Pressable onPress={() => setRetry((n) => n + 1)} accessibilityRole="button" accessibilityLabel="Retry Eddy's Read" style={styles.retry}>
          <Text style={[styles.body, { color: colors.textMuted }]}>Couldn’t load this Read.</Text>
          <Text style={[styles.action, { color: colors.interactive }]}>Retry</Text>
        </Pressable>
      ) : canUnlock ? (
        <Pressable
          onPress={onUnlock}
          accessibilityRole="button"
          accessibilityLabel={`Unlock Eddy's Read for ${damName} with Premium`}
          accessibilityHint="Opens Premium subscription options"
          style={({ pressed }) => [styles.locked, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={[styles.body, { color: colors.text }]}>
            When the units have usually come on lately, how closely the posted schedule has held, and what today&apos;s plan means beside it.
          </Text>
          <BlurredReadPreview lines={4} />
          <Text style={[styles.action, { color: colors.interactive }]}>Unlock with Premium</Text>
        </Pressable>
      ) : (
        // Loading, a member's prose in flight, or an account not yet settled:
        // reserve the space without either the Read or an offer.
        <BlurredReadPreview lines={4} />
      )}

      {age ? <Text style={[styles.age, { color: colors.textMuted }]}>{age}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { fontFamily: fonts.heading, fontSize: 12, letterSpacing: 0.7 },
  prose: { gap: 8 },
  summary: { ...textStyles.cardTitle },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  locked: { gap: 10, minHeight: 44 },
  retry: { gap: 4, minHeight: 44, justifyContent: 'center' },
  action: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  age: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
});
