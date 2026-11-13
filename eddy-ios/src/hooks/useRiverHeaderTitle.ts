import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { riverTitleCollapsed } from '@/lib/riverHeader';

/** Scroll events update a ref; React updates only when the title crosses the bar. */
export function useRiverHeaderTitle(slug: string, topInset: number) {
  const held = useRef({ slug, bottom: null as number | null, offset: -topInset, collapsed: false });
  const [visible, setVisible] = useState({ slug, collapsed: false });
  const update = useCallback((change: { bottom?: number; offset?: number }) => {
    const changedRiver = held.current.slug !== slug;
    if (changedRiver) held.current = { slug, bottom: null, offset: -topInset, collapsed: false };
    const current = held.current;
    if (change.bottom !== undefined) current.bottom = change.bottom;
    if (change.offset !== undefined) current.offset = change.offset;
    const collapsed = riverTitleCollapsed(current.bottom, current.offset, topInset);
    if (changedRiver || collapsed !== current.collapsed) {
      current.collapsed = collapsed;
      setVisible({ slug, collapsed });
    }
  }, [slug, topInset]);
  const onTitleBottom = useCallback((bottom: number) => update({ bottom }), [update]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    update({ offset: event.nativeEvent.contentOffset.y });
  }, [update]);
  return { collapsed: visible.slug === slug && visible.collapsed, onTitleBottom, onScroll };
}
