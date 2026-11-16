/** Attribution sits on the photo itself: author and license, both linked. The
 * text is small but kept readable, since a credit nobody can read is not
 * "reasonable" attribution under CC BY. How images were modified is listed on
 * /photo-credits, not repeated here. */
export default function PhotoCreditOverlay({ author, sourceUrl, license, licenseUrl }: {
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}) {
  return <p className="absolute bottom-0 right-0 z-[1] m-0 max-w-full truncate rounded-tl bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white/90">
    <a href={sourceUrl} className="hover:underline">{author}</a>{' · '}
    <a href={licenseUrl} className="hover:underline">{license}</a>
  </p>;
}
