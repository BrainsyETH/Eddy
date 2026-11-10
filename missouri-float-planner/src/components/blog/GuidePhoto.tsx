import Image from 'next/image';
import type { GuidePhotoDetail } from '@/types/blog';
import { optimizeBlogImage } from '@/lib/blog-image';

export function GuidePhotoCaption({ photo }: { photo: GuidePhotoDetail }) {
  return <figcaption className="px-3 py-2 text-xs leading-relaxed text-neutral-600">
    {photo.caption}{' '}<a href={photo.source_url} className="underline">{photo.author}</a>{' · '}
    <a href={photo.license_url} className="underline">{photo.license}</a>. Resized and cropped for display.
  </figcaption>;
}

export default function GuidePhoto({ photo }: { photo: GuidePhotoDetail }) {
  return <figure className="m-0 mt-3 overflow-hidden rounded-lg border border-neutral-300 bg-white">
    <div className="relative aspect-[16/9]">
      <Image src={photo.url} alt={photo.alt} fill sizes="(max-width: 767px) 100vw, 600px" unoptimized={!optimizeBlogImage(photo.url)} className="object-cover" />
    </div>
    <GuidePhotoCaption photo={photo} />
  </figure>;
}
