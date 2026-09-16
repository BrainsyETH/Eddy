import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onForeground } from '@/lib/foreground';
import { ApiError, fetchPremiumEddyRead, type PremiumEddyRead } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { premiumExcerpt } from '@/lib/todayPresentation';
import { writtenAge } from '@/lib/eddySays';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Parent mounts only for Premium and keys by user: no cross-user prose cache. */
export function PremiumReadPreview({ slug, revision, onPhoto = false }: { slug: string; revision: string; onPhoto?: boolean }) {
  const theme = useTheme();
  const colors = onPhoto ? { ...theme.colors, text: '#ffffff', textMuted: '#e2eee8', textSubtle: '#cbded5', interactive: '#ffffff' } : theme.colors;
  const { getAccessToken } = useSession();
  const key = JSON.stringify([slug, revision]);
  const [result, setResult] = useState<{ key: string; data: PremiumEddyRead | null; error: boolean } | null>(null);
  const active = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const loaded = useRef<{ key: string; at: number } | null>(null);
  const refresh = useCallback((force = false) => {
    if (!active.current || pending.current || (!force && loaded.current?.key === key && Date.now() - loaded.current.at < 60_000)) return;
    const controller = new AbortController();
    pending.current = controller;
    void (async () => {
      const token = await getAccessToken();
      if (!token) throw new ApiError('No active session', 401);
      return fetchPremiumEddyRead(slug, token, controller.signal);
    })().then(data => {
      if (controller.signal.aborted) return;
      loaded.current = { key, at: Date.now() };
      setResult({ key, data, error: false });
    }).catch(error => {
      if (controller.signal.aborted) return;
      // Authorization failures must clear the previously displayed Premium text.
      const forbidden = error instanceof ApiError && (error.status === 401 || error.status === 403);
      setResult(previous => ({ key, data: !forbidden && previous?.key === key ? previous.data : null, error: true }));
    }).finally(() => { if (pending.current === controller) pending.current = null; });
  }, [getAccessToken, key, slug]);
  useFocusEffect(useCallback(() => {
    active.current = true; refresh();
    return () => { active.current = false; pending.current?.abort(); pending.current = null; };
  }, [refresh]));
  useEffect(() => onForeground(() => refresh()), [refresh]);
  const current = result?.key === key ? result : null;
  return <View style={{ marginTop: 10, minHeight: 70, gap: 6 }}>
    {!current ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <ActivityIndicator size="small" color={colors.interactive} /><Text style={{ ...t.xs, color: colors.textMuted }}>Loading your Read…</Text>
    </View> : <>
      {current.data ? <><Text numberOfLines={3} style={{ ...t.sm, fontFamily: fonts.body, color: colors.text, lineHeight: 21 }}>{premiumExcerpt(current.data.fullRead)}</Text><Text style={{ ...t.xs, color: colors.textSubtle }}>{writtenAge(current.data.generatedAt)}</Text></> : null}
      {current.error || !current.data ? <><Text style={{ ...t.xs, color: colors.textMuted }}>{current.error ? (current.data ? 'Couldn’t refresh. Showing the previous Read.' : 'Couldn’t load this Read.') : 'No current Premium Read is available.'}</Text><Pressable onPress={event => { event.stopPropagation(); refresh(true); }} accessibilityRole="button" accessibilityLabel="Retry Premium Read" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ ...t.sm, color: colors.interactive }}>Retry Read</Text></Pressable></> : null}
    </>}
  </View>;
}
