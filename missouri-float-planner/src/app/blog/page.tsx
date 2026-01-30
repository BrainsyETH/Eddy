import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Missouri Float Trip Guides & Resources',
  description: 'Expert guides and tips for planning the perfect float trip on Missouri rivers. Learn about water conditions, access points, and the best times to float.',
};

const blogPosts = [
  {
    slug: 'best-float-rivers-missouri-2026',
    title: 'Best Float Rivers in Missouri: Complete Guide 2026',
    description: 'Discover the top 8 float rivers in Missouri, from beginner-friendly creeks to scenic Ozark waterways. Compare difficulty, scenery, and access points.',
    date: '2026-01-29',
    readTime: '12 min read',
    category: 'Guides',
  },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Float Trip Guides & Resources
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Expert tips, river guides, and planning advice for Missouri float trips
          </p>
        </div>

        <div className="space-y-8">
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-200"
            >
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                  {post.category}
                </span>
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </time>
                <span>•</span>
                <span>{post.readTime}</span>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-2 hover:text-blue-600 transition-colors">
                {post.title}
              </h2>

              <p className="text-gray-600 mb-4">{post.description}</p>

              <div className="text-blue-600 font-medium flex items-center gap-2">
                Read article
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
