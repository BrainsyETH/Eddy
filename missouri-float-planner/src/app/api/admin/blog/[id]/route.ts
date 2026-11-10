import { revalidatePath } from 'next/cache';
import { withAdminMutation } from '@/lib/admin/mutation-audit';
// src/app/api/admin/blog/[id]/route.ts
// GET /api/admin/blog/[id] - Get single blog post for editing
// PUT /api/admin/blog/[id] - Update blog post
// DELETE /api/admin/blog/[id] - Delete blog post

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, logAdminAction, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import { sanitizeRichText } from '@/lib/sanitize';

import { BLOG_CATEGORIES, publicationState, formatAdminPost } from '@/lib/admin/blog-publication';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching blog post:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Blog post not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Could not fetch blog post' },
        { status: 500 }
      );
    }

    const formatted = formatAdminPost(data);

    return NextResponse.json({ post: formatted });
  } catch (error) {
    console.error('Error in get blog post endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handlePUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
    const body = await request.json();
    const {
      title,
      slug,
      description,
      content,
      category,
      featuredImageUrl,
      ogImageUrl,
      metaKeywords,
      readTimeMinutes,
      status,
      publishedAt,
    } = body;

    const supabase = createAdminClient();

    if (typeof body.expectedUpdatedAt !== 'string') return NextResponse.json({ error: 'Reload this post before saving.' }, { status: 428 });
    const { data: existing, error: readError } = await supabase.from('blog_posts').select('*').eq('id', id).maybeSingle();
    if (readError) return NextResponse.json({ error: 'Could not load the current post.' }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    if (existing.updated_at !== body.expectedUpdatedAt) return NextResponse.json({ error: 'This post changed in another session. Your draft is kept here. Open the latest post in another tab to compare before saving.' }, { status: 409 });

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json(
          { error: 'Title cannot be empty' },
          { status: 400 }
        );
      }
      updateData.title = title.trim();
    }

    if (slug !== undefined) {
      if (typeof slug !== 'string' || slug.trim().length === 0) {
        return NextResponse.json(
          { error: 'Slug cannot be empty' },
          { status: 400 }
        );
      }
      updateData.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
    }

    if (description !== undefined) {
      updateData.description = description === '' ? null : description;
    }

    if (content !== undefined) {
      if (content !== null && typeof content !== 'string') {
        return NextResponse.json({ error: 'Content must be text' }, { status: 400 });
      }
      const sanitized = content ? sanitizeRichText(content) : null;
      updateData.content = sanitized;
    }

    if (category !== undefined) {
      if (existing.guide_data && category !== existing.category) {
        return NextResponse.json({ error: 'Keep the category of this structured guide. Use the guide editing workflow to change its format.' }, { status: 400 });
      }
      const validCategories = BLOG_CATEGORIES;
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.category = category;
    }

    if (featuredImageUrl !== undefined) {
      updateData.featured_image_url = featuredImageUrl === '' ? null : featuredImageUrl;
    }

    if (ogImageUrl !== undefined) {
      updateData.og_image_url = ogImageUrl === '' ? null : ogImageUrl;
    }

    if (metaKeywords !== undefined) {
      updateData.meta_keywords = Array.isArray(metaKeywords) ? metaKeywords : null;
    }

    if (readTimeMinutes !== undefined) {
      updateData.read_time_minutes = readTimeMinutes === '' || readTimeMinutes === null ? null : parseInt(readTimeMinutes, 10);
    }

    try {
      Object.assign(updateData, publicationState(status ?? existing.status, publishedAt, existing.published_at));
      const resultingContent = content === undefined ? existing.content : updateData.content;
      if (updateData.status !== 'draft' && !resultingContent && !existing.guide_data) throw new Error('Add body content before publishing.');
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    updateData.updated_at = new Date().toISOString();

    // Check if we have anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .update(updateData)
      .eq('id', id)
      .eq('updated_at', body.expectedUpdatedAt)
      .select()
      .single();

    if (error?.code === 'PGRST116') return NextResponse.json({ error: 'This post changed while you were saving. Your draft is still here.' }, { status: 409 });
    if (error) {
      console.error('Error updating blog post:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A blog post with this slug already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Could not update blog post' },
        { status: 500 }
      );
    }

    revalidatePath(`/blog/${existing.slug}`); revalidatePath(`/blog/${data.slug}`); revalidatePath('/blog'); revalidatePath('/sitemap.xml');
    await logAdminAction({ request, action: 'update', entityType: 'blog_post', entityId: id, entityName: data.title, details: { before: existing, after: updateData } });
    const formatted = formatAdminPost(data);

    return NextResponse.json({ post: formatted });
  } catch (error) {
    console.error('Error in update blog post endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleDELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
    const supabase = createAdminClient();

    const { data: existing, error: readError } = await supabase.from('blog_posts').select('*').eq('id', id).single();
    if (readError) return NextResponse.json({ error: 'Could not load the post to delete.' }, { status: 500 });
    const expected = request.nextUrl.searchParams.get('version');
    if (!expected || expected !== existing.updated_at) return NextResponse.json({ error: 'This post changed. Reload before deleting.' }, { status: 409 });
    const { data: removed, error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id).eq('updated_at', expected).select('id');

    if (error) {
      console.error('Error deleting blog post:', error);
      return NextResponse.json(
        { error: 'Could not delete blog post' },
        { status: 500 }
      );
    }

    if (!removed?.length) return NextResponse.json({ error: 'Post changed. Reload before deleting.' }, { status: 409 });
    revalidatePath(`/blog/${existing.slug}`); revalidatePath('/blog'); revalidatePath('/sitemap.xml');
    await logAdminAction({ request, action: 'delete', entityType: 'blog_post', entityId: id, entityName: existing.title, details: { before: existing } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in delete blog post endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const PUT = withAdminMutation(handlePUT);
export const DELETE = withAdminMutation(handleDELETE);
