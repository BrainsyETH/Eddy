import type { GuidePhoto } from '@/lib/photos/guides';

/** Keep outside a card's article link so source and license links stay valid. */
export default function GuidePhotoCredit({ photo, caption = false }: { photo?: GuidePhoto; caption?: boolean }) {
  if (!photo) return null;
  return (
    <p className="text-xs leading-relaxed text-neutral-600 mt-2">
      {caption && <span className="block mb-1">{photo.caption}</span>}
      Photo: <a href={photo.sourceUrl} className="underline">{photo.author}</a>
      {' · '}<a href={photo.licenseUrl} className="underline">{photo.license}</a>
      {' · '}<a href={`/photo-credits#guide-${photo.riverSlug}`} className="underline">Image details</a>
    </p>
  );
}
