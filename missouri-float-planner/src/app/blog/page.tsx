import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BookOpen } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import SiteFooter from '@/components/ui/SiteFooter';

export const metadata: Metadata = {
  title: "Eddy's Thoughts - Float Trip Guides & Resources",
  description: 'Expert guides and tips for planning the perfect float trip. Learn about water conditions, access points, and the best times to float.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 60; // Revalidate every 60 seconds

interface BlogPost {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  featured_image_url: string | null;
  read_time_minutes: number | null;
  published_at: string | null;
  river_slug: string | null;
}

async function getBlogPosts(): Promise<BlogPost[]> {
  const supabase = createAdminClient();

  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, category, featured_image_url, read_time_minutes, published_at, river_slug')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }

  return posts || [];
}

// Look up display names for the rivers referenced by the posts, so cards can
// lead with the river name (e.g. "Current River") instead of burying it in the title.
async function getRiverNames(slugs: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(slugs.filter(Boolean)));
  if (unique.length === 0) return {};

  const supabase = createAdminClient();
  const { data, error } = await supabase.from('rivers').select('slug, name').in('slug', unique);

  if (error) {
    console.error('Error fetching river names:', error);
    return {};
  }

  const map: Record<string, string> = {};
  for (const river of data || []) {
    if (river.slug && river.name) map[river.slug] = river.name;
  }
  return map;
}

// Titles are stored as "<River Name> Float Trip Guide: …". Once the card shows
// the river name on top, strip that leading prefix so it isn't repeated.
function stripRiverName(title: string, riverName: string | null): string {
  if (!riverName) return title;
  const trimmed = title.trimStart();
  if (trimmed.toLowerCase().startsWith(riverName.toLowerCase())) {
    return trimmed.slice(riverName.length).replace(/^[\s:–—-]+/, '').trim() || title;
  }
  return title;
}

export default async function BlogPage() {
  const blogPosts = await getBlogPosts();
  const riverNames = await getRiverNames(
    blogPosts.map((post) => post.river_slug).filter((slug): slug is string => Boolean(slug)),
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-neutral-50">
      {/* Hero */}
      <section className="relative py-12 md:py-16 text-white" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full" style={{ backgroundColor: '#1D525F' }}>
              <BookOpen className="w-8 h-8 text-primary-300" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}>
            Eddy&apos;s Thoughts
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto">
            Tips, guides, and planning advice for your next float trip
          </p>
        </div>
      </section>

      {/* Blog Posts */}
      <section className="flex-1 py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4">
          {blogPosts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-neutral-500">No blog posts yet. Check back soon!</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {blogPosts.map((post) => {
                const riverName = post.river_slug ? riverNames[post.river_slug] ?? null : null;
                const displayTitle = stripRiverName(post.title, riverName);
                return (
                  <Link
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    className="group flex flex-col overflow-hidden bg-white border-2 border-neutral-200 rounded-xl p-4 sm:p-6 shadow-sm
                               hover:border-primary-400 hover:shadow-md transition-all no-underline"
                  >
                    {post.featured_image_url && (
                      <div className="-mt-4 -mx-4 sm:-mt-6 sm:-mx-6 mb-4 rounded-t-xl overflow-hidden">
                        <img
                          src={post.featured_image_url}
                          alt={riverName ?? post.title}
                          className="w-full h-40 object-cover"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
                        {riverName ?? post.category}
                      </span>
                      {post.read_time_minutes && (
                        <span className="text-xs text-neutral-500">{post.read_time_minutes} min read</span>
                      )}
                    </div>

                    <h2 className="text-lg font-bold text-neutral-900 mb-2 group-hover:text-primary-700 transition-colors">
                      {displayTitle}
                    </h2>

                    {post.description && (
                      <p className="text-sm text-neutral-600 mb-4 line-clamp-2">{post.description}</p>
                    )}

                    <div className="mt-auto pt-2 flex justify-center">
                      <span
                        className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-accent-500 transition-colors group-hover:bg-accent-600"
                      >
                        View Guide
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* CTA to main app */}
          <div className="mt-12 text-center">
            <p className="text-neutral-600 mb-4">Ready to start planning your float?</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors shadow-lg"
            >
              Plan Your Float
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
