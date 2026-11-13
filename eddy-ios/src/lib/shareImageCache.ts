import { Directory, File, Paths } from 'expo-file-system';

let generation = 0;
export const shareImageRevision = () => generation;

const MAX_AGE = 30 * 24 * 60 * 60_000;
// Rebuild older posters after the recap-aligned presentation ships.
const DESIGN_VERSION = 2;
function files(identity: string, name: string) {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  const directory = new Directory(Paths.cache, 'eddy-float-shares');
  const stem = `${name}-${(hash >>> 0).toString(16)}`;
  return { directory, file: new File(directory, `${stem}.png`), meta: new File(directory, `${stem}.json`) };
}

export function readShareImage(identity: string, name: string): { file: File; link: string | null } | null {
  try {
    const { file, meta } = files(identity, name);
    if (!file.exists || !file.size || !meta.exists) return null;
    const saved = JSON.parse(meta.textSync());
    if (saved.designVersion !== DESIGN_VERSION || saved.identity !== identity || !(saved.at <= Date.now() && Date.now() - saved.at < MAX_AGE)) return null;
    return { file, link: typeof saved.link === 'string' && saved.link.startsWith('/') ? saved.link : null };
  } catch { return null; }
}

/** Bounded, disposable cache of successful server images only; local fallbacks never replace one. */
export function cacheShareImage(identity: string, name: string, bytes: Uint8Array, link: string | null, revision: number): void {
  if (revision !== generation) return;
  try {
    const { directory, file, meta } = files(identity, name);
    directory.create({ intermediates: true, idempotent: true });
    file.write(bytes);
    meta.write(JSON.stringify({ identity, link, at: Date.now(), designVersion: DESIGN_VERSION }));
    const images = directory.list().filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.png'))
      .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
    for (const old of images.slice(20)) {
      old.delete();
      const metadata = new File(directory, old.name.replace(/\.png$/, '.json'));
      if (metadata.exists) metadata.delete();
    }
  } catch { /* Sharing still works when a cache write fails. */ }
}

export function clearFloatShareImages() {
  generation++;
  const directory = new Directory(Paths.cache, 'eddy-float-shares');
  if (directory.exists) directory.delete();
}
