import Link from 'next/link';

// blog_posts.updated_at also changes on social shares. Until a dedicated
// content-edit timestamp exists, publication is the only date we can claim.
export default function ArticleByline({ publishedAt }: {
  publishedAt: string | null;
}) {
  return (
    <>
      <span>·</span>
      <span>Published by <Link href="/about" className="underline underline-offset-2">Eddy</Link></span>
      {publishedAt && <><span>·</span><time dateTime={publishedAt}>Published {new Date(publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time></>}
    </>
  );
}
