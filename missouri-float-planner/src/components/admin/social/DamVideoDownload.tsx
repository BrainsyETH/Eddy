'use client';
import { useState } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';

export default function DamVideoDownload({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="mt-4"><button disabled={busy} className="px-4 py-2 rounded bg-primary-600 text-white disabled:opacity-50" onClick={async () => {
    setBusy(true); setError('');
    try {
      const response = await adminFetch(`/api/admin/social/dam-schedule/${id}/download`);
      if (!response.ok) throw new Error((await response.json()).error || 'Download failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = response.headers.get('content-disposition')?.match(/filename="([a-zA-Z0-9-]+\.mp4)"/)?.[1] || `eddy-dam-schedule-${id}.mp4`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Download failed.'); }
    finally { setBusy(false); }
  }}>{busy ? 'Downloading…' : 'Download MP4'}</button><p role="status" className="text-sm text-red-300 mt-2">{error}</p></div>;
}
