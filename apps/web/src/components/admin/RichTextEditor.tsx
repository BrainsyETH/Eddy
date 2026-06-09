'use client';

// src/components/admin/RichTextEditor.tsx
// TipTap-based rich text editor for blog posts

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { useCallback, useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Code2,
} from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  onImageUpload?: () => Promise<string | null>;
}

function MenuButton({
  onClick,
  isActive = false,
  disabled = false,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded transition-colors ${
        isActive
          ? 'bg-primary-600 text-white'
          : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

function MenuBar({ editor, onImageUpload }: { editor: Editor | null; onImageUpload?: () => Promise<string | null> }) {
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const addLink = useCallback(() => {
    if (linkUrl && editor) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
      setLinkUrl('');
      setShowLinkInput(false);
    }
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
    }
  }, [editor]);

  const addImage = useCallback(async () => {
    if (onImageUpload) {
      const url = await onImageUpload();
      if (url && editor) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    } else {
      const url = window.prompt('Enter image URL:');
      if (url && editor) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    }
  }, [editor, onImageUpload]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border-b border-neutral-700 p-2 flex flex-wrap gap-1 bg-neutral-800 rounded-t-lg">
      {/* Undo/Redo */}
      <MenuButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo className="w-4 h-4" />
      </MenuButton>

      <div className="w-px bg-neutral-700 mx-1" />

      {/* Text formatting */}
      <MenuButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Underline"
      >
        <UnderlineIcon className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="Inline Code"
      >
        <Code className="w-4 h-4" />
      </MenuButton>

      <div className="w-px bg-neutral-700 mx-1" />

      {/* Headings */}
      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="w-4 h-4" />
      </MenuButton>

      <div className="w-px bg-neutral-700 mx-1" />

      {/* Lists */}
      <MenuButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered className="w-4 h-4" />
      </MenuButton>

      <div className="w-px bg-neutral-700 mx-1" />

      {/* Block elements */}
      <MenuButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Quote"
      >
        <Quote className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title="Code Block"
      >
        <Code2 className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus className="w-4 h-4" />
      </MenuButton>

      <div className="w-px bg-neutral-700 mx-1" />

      {/* Alignment */}
      <MenuButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({ textAlign: 'left' })}
        title="Align Left"
      >
        <AlignLeft className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({ textAlign: 'center' })}
        title="Align Center"
      >
        <AlignCenter className="w-4 h-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({ textAlign: 'right' })}
        title="Align Right"
      >
        <AlignRight className="w-4 h-4" />
      </MenuButton>

      <div className="w-px bg-neutral-700 mx-1" />

      {/* Link */}
      {showLinkInput ? (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="px-2 py-1 bg-neutral-900 border border-neutral-600 rounded text-sm text-white w-48"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLink();
              } else if (e.key === 'Escape') {
                setShowLinkInput(false);
                setLinkUrl('');
              }
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={addLink}
            className="px-2 py-1 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl('');
            }}
            className="px-2 py-1 bg-neutral-700 text-white text-sm rounded hover:bg-neutral-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <MenuButton
            onClick={() => {
              if (editor.isActive('link')) {
                removeLink();
              } else {
                setShowLinkInput(true);
              }
            }}
            isActive={editor.isActive('link')}
            title={editor.isActive('link') ? 'Remove Link' : 'Add Link'}
          >
            <LinkIcon className="w-4 h-4" />
          </MenuButton>
          <MenuButton
            onClick={addImage}
            title="Insert Image"
          >
            <ImageIcon className="w-4 h-4" />
          </MenuButton>
        </>
      )}
    </div>
  );
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start writing your blog post...',
  onImageUpload,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary-400 underline',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full rounded-lg my-4',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-lg max-w-none focus:outline-none min-h-[400px] p-4',
      },
    },
  });

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-900">
      <MenuBar editor={editor} onImageUpload={onImageUpload} />
      <EditorContent editor={editor} />
    </div>
  );
}
