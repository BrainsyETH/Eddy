import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onForeground } from '@/lib/foreground';
import { ApiError, fetchPremiumEddyRead, type PremiumEddyRead } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { premiumExcerpt } from '@/lib/todayPresentation';
import { writtenAge } from '@/lib/eddySays';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Mounted only for Premium. No disk/global prose cache; identity changes remount it. */
export function PremiumReadPreview({ slug, revision }: { slug: string; revision: string }) {
  const { colors } = useTheme();
  const { getAccessToken } = useSession();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data: PremiumEddyRead | null; error: boolean } | null>(null);
  const key = JSON.stringify([slug, revision, retry]);
  useEffect(() => onForeground(() => setRetry((value) => value + 1)), []);
  useFocusEffect(useCallback(() => {
    setResult(null);
    const controller = new AbortController();
    void (async () => {
      const token = await getAccessToken();
      if (!token) throw new ApiError('No active session');
      return fetchPremiumEddyRead(slug, token, controller.signal);
    })().then((data) => {
      if (!controller.signal.aborted) setResult({ key, data, error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, data: null, error: true });
    });
    return () => controller.abort();
  }, [getAccessToken, slug, key]));
  const current = result?.key === key ? result : null;
  return <View style={{ marginTop: 10, minHeight: 70, gap: 6 }}>
    {!current ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <ActivityIndicator size="small" color={colors.interactive} />
      <Text style={{ ...t.xs, color: colors.textMuted }}>Loading your Read…</Text>
    </View> : current.data ? <>
      <Text numberOfLines={3} style={{ ...t.sm, fontFamily: fonts.body, color: colors.text, lineHeight: 21 }}>{premiumExcerpt(current.data.fullRead)}</Text>
      <Text style={{ ...t.xs, color: colors.textSubtle }}>{writtenAge(current.data.generatedAt)}</Text>
    </> : <>
      <Text style={{ ...t.xs, color: colors.textMuted }}>{current.error ? 'Couldn’t load this Read.' : 'No current Premium Read is available.'}</Text>
      <Pressable onPress={(event) => { event.stopPropagation(); setRetry((value) => value + 1); }} accessibilityRole="button" accessibilityLabel="Retry Premium Read" style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ ...t.sm, color: colors.interactive }}>Retry Read</Text>
      </Pressable>
    </>}
  </View>;
}

