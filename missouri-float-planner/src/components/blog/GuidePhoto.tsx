import Image from 'next/image';
import type { GuidePhotoDetail } from '@/types/blog';
import { optimizeBlogImage } from '@/lib/blog-image';
import PhotoCreditOverlay from './PhotoCreditOverlay';

export default function GuidePhoto({ photo }: { photo: GuidePhotoDetail }) {
  return <figure className="m-0 mt-3 overflow-hidden rounded-lg border border-neutral-300 bg-white">
    <div className="relative aspect-[16/9]">
      <Image src={photo.url} alt={photo.alt} fill sizes="(max-width: 767px) 100vw, 600px" unoptimized={!optimizeBlogImage(photo.url)} className="object-cover" />
      <PhotoCreditOverlay author={photo.author} sourceUrl={photo.source_url} license={photo.license} licenseUrl={photo.license_url} />
    </div>
    <figcaption className="px-3 py-2 text-xs leading-relaxed text-neutral-600">{photo.caption}</figcaption>
  </figure>;
}
