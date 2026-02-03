-- Migration: Create blog_posts table for CMS functionality
-- Enables admin to create, edit, and manage blog posts

CREATE TABLE blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core content
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,  -- Used for cards and meta description
    content TEXT,      -- HTML content from rich text editor

    -- Categorization
    category TEXT NOT NULL DEFAULT 'Guides' CHECK (category IN ('Guides', 'Tips', 'News', 'Safety', 'River Profiles', 'Gear Reviews', 'Trip Reports')),

    -- Media
    featured_image_url TEXT,
    og_image_url TEXT,  -- Open Graph image for social sharing

    -- SEO
    meta_keywords TEXT[],  -- Array of keywords

    -- Reading time (calculated or manually set)
    read_time_minutes INTEGER,

    -- Publishing
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled')),
    published_at TIMESTAMPTZ,  -- When the post was/will be published

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX idx_blog_posts_category ON blog_posts(category);

-- Add comments for documentation
COMMENT ON TABLE blog_posts IS 'Blog posts managed through the admin CMS';
COMMENT ON COLUMN blog_posts.slug IS 'URL-friendly identifier for the post';
COMMENT ON COLUMN blog_posts.content IS 'HTML content from rich text editor';
COMMENT ON COLUMN blog_posts.status IS 'Publication status: draft, published, or scheduled';
COMMENT ON COLUMN blog_posts.published_at IS 'Publication date/time, used for scheduling';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_blog_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_updated_at
    BEFORE UPDATE ON blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_blog_posts_updated_at();

-- RLS policies
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read published posts that are past their publish date
CREATE POLICY blog_posts_public_read ON blog_posts
    FOR SELECT
    TO anon, authenticated
    USING (
        status = 'published'
        AND (published_at IS NULL OR published_at <= NOW())
    );

-- Admins can do everything
CREATE POLICY blog_posts_admin_all ON blog_posts
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Helper function to calculate read time from content
CREATE OR REPLACE FUNCTION calculate_read_time(content TEXT)
RETURNS INTEGER AS $$
DECLARE
    word_count INTEGER;
    words_per_minute INTEGER := 200;
BEGIN
    -- Strip HTML tags and count words
    word_count := array_length(
        regexp_split_to_array(
            regexp_replace(content, '<[^>]*>', '', 'g'),
            '\s+'
        ),
        1
    );
    -- Return minutes, minimum 1
    RETURN GREATEST(1, CEIL(word_count::DECIMAL / words_per_minute));
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_read_time IS 'Calculates estimated read time in minutes from HTML content';
