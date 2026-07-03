// src/app/gauges/page.tsx
// There is no gauges index — the river reports dashboard at /rivers is the
// canonical list of gauges, so send bare /gauges visits (old links, bookmarks) there.

import { redirect } from 'next/navigation';

export default function GaugesIndex() {
  redirect('/rivers');
}
