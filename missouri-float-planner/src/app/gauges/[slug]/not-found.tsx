import Link from 'next/link';

export default function GaugeNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-neutral-100 flex items-center justify-center">
          <span className="text-2xl" aria-hidden="true">📊</span>
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">
          River gauge not found
        </h2>
        <p className="text-neutral-500 text-sm mb-6">
          We couldn&apos;t find gauge data for this river. The link may be incorrect.
        </p>
        <Link
          href="/gauges"
          className="inline-block px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors no-underline"
        >
          View all river reports
        </Link>
      </div>
    </div>
  );
}
