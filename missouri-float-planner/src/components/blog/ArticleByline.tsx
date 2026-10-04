import Link from 'next/link';

export default function ArticleByline({ publishedAt, updatedAt }: {
  publishedAt: string | null;
  updatedAt?: string | null;
}) {
  const updated = updatedAt && (!publishedAt || new Date(updatedAt) > new Date(publishedAt));
  const date = updated ? updatedAt : publishedAt;
  return (
    <>
      <span>·</span>
      <span>By <Link href="/about" className="underline underline-offset-2">Eddy</Link></span>
      {date && <><span>·</span><time dateTime={date}>{updated ? 'Updated ' : 'Published '}{new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time></>}
    </>
  );
}
