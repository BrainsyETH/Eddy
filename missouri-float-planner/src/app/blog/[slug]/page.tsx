import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight, Clock, Calendar } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import SiteFooter from '@/components/ui/SiteFooter';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export const dynamic = 'force-dynamic';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content: string | null;
  category: string;
  featured_image_url: string | null;
  og_image_url: string | null;
  meta_keywords: string[] | null;
  read_time_minutes: number | null;
  published_at: string | null;
}

async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const supabase = createAdminClient();

  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .single();

  if (error || !post) {
    console.error('Error fetching blog post:', error);
    return null;
  }

  return post;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.title,
    description: post.description || undefined,
    keywords: post.meta_keywords || undefined,
    alternates: {
      canonical: `${BASE_URL}/blog/${slug}`,
      types: {
        'application/json': `${BASE_URL}/api/blog/${slug}`,
      },
    },
    openGraph: {
      title: post.title,
      description: post.description || undefined,
      type: 'article',
      images: post.og_image_url ? [post.og_image_url] : post.featured_image_url ? [post.featured_image_url] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description || undefined,
      images: post.og_image_url ? [post.og_image_url] : post.featured_image_url ? [post.featured_image_url] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description || undefined,
    datePublished: post.published_at || undefined,
    image: post.featured_image_url || undefined,
    url: `${BASE_URL}/blog/${post.slug}`,
    publisher: {
      '@type': 'Organization',
      name: 'Eddy',
      url: BASE_URL,
    },
  };

  // Extract FAQ pairs from river-guide posts for FAQPage JSON-LD
  // Convention: <div id="faq"> containing <h3> (question) + <p> (answer) pairs
  let faqJsonLd: object | null = null;
  if (post.category === 'River Profiles' && post.content) {
    const faqMatch = post.content.match(/<div id="faq">([\s\S]*?)<\/div>/);
    if (faqMatch) {
      const faqHtml = faqMatch[1];
      const qaPairs: { question: string; answer: string }[] = [];
      const qRegex = /<h3[^>]*>(.*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
      let match;
      while ((match = qRegex.exec(faqHtml)) !== null) {
        qaPairs.push({
          question: match[1].replace(/<[^>]+>/g, ''),
          answer: match[2].replace(/<[^>]+>/g, ''),
        });
      }
      if (qaPairs.length > 0) {
        faqJsonLd = {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: qaPairs.map(qa => ({
            '@type': 'Question',
            name: qa.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: qa.answer,
            },
          })),
        };
      }
    }
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${BASE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${BASE_URL}/blog/${post.slug}` },
    ],
  };

  return (
    <article className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-16">
        {/* Header */}
        <header className="mb-8 md:mb-12">
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
            <Link
              href="/blog"
              className="flex items-center gap-1 hover:text-primary-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Blog
            </Link>
            {post.published_at && (
              <>
                <span>•</span>
                <time dateTime={post.published_at} className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(post.published_at)}
                </time>
              </>
            )}
            {post.read_time_minutes && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {post.read_time_minutes} min read
                </span>
              </>
            )}
          </div>

          <div className="mb-4">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
              {post.category}
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            {post.title}
          </h1>

          {post.description && (
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
              {post.description}
            </p>
          )}
        </header>

        {/* Featured Image */}
        {post.featured_image_url && (
          <div className="mb-8 md:mb-12 -mx-4 md:mx-0">
            <img
              src={post.featured_image_url}
              alt={post.title}
              className="w-full h-64 md:h-96 object-cover md:rounded-xl"
            />
          </div>
        )}

        {/* Content */}
        {post.content && (
          <div
            className="prose prose-lg max-w-none
                       prose-headings:font-bold prose-headings:text-gray-900
                       prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                       prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                       prose-p:text-gray-700 prose-p:leading-relaxed
                       prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline
                       prose-strong:text-gray-900
                       prose-ul:text-gray-700 prose-ol:text-gray-700
                       prose-li:my-1
                       prose-blockquote:border-l-4 prose-blockquote:border-primary-500 prose-blockquote:bg-gray-50 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg
                       prose-code:text-primary-700 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                       prose-pre:bg-gray-900 prose-pre:text-gray-100
                       prose-img:rounded-lg prose-img:shadow-md"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        )}

        {/* Footer CTA */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="bg-primary-50 rounded-xl p-6 md:p-8 text-center">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">
              Ready to Plan Your Float Trip?
            </h2>
            <p className="text-gray-600 mb-6 max-w-lg mx-auto">
              Use Eddy to plan your perfect float trip with real-time water conditions,
              access points, and float time estimates.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors shadow-lg"
            >
              Start Planning
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

        {/* Back to blog */}
        <div className="mt-8 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to all posts
          </Link>
        </div>
      </div>

      <SiteFooter maxWidth="max-w-4xl" className="mt-12" />
    </article>
  );
}
