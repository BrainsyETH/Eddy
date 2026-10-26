'use client';

import { useId } from 'react';
import RichTextEditor from './RichTextEditor';
import { REPLY_TEMPLATES } from '@/lib/email/reply-templates';

/** The same rich-text editor and quick replies for feedback and inbound mail. */
export default function EmailReplyEditor({ html, onChange }: {
  html: string; onChange: (html: string) => void;
}) {
  const id = useId();
  return <>
    <div className="mb-2 flex items-center gap-2">
      <label htmlFor={id} className="text-xs text-neutral-400">Template:</label>
      <select id={id} value="" onChange={(event) => {
        const template = REPLY_TEMPLATES.find((item) => item.id === event.target.value);
        if (template) onChange(template.html);
      }} className="max-w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-200">
        <option value="">Insert a quick reply…</option>
        {REPLY_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
      </select>
    </div>
    <RichTextEditor content={html} onChange={onChange} minHeight="150px" placeholder="Write your reply…" />
  </>;
}
