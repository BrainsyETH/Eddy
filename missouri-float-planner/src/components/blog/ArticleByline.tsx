import Link from 'next/link';

// Dates come from explicit editorial fields, never operational row updates.
export default function ArticleByline({ publishedAt, editorialDate }: {
  publishedAt: string | null;
  editorialDate?: string;
}) {
  return (
    <>
      <span>·</span>
      <span>Published by <Link href="/about" className="underline underline-offset-2">Eddy</Link></span>
      {editorialDate && <><span>·</span><time dateTime={editorialDate}>Updated {new Date(`${editorialDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time></>}
      {!editorialDate && publishedAt && <><span>·</span><time dateTime={publishedAt}>Published {new Date(publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time></>}
    </>
  );
}
