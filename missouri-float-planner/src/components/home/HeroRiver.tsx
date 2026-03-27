'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const EDDY_CANOE =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

// Water sparkle positions (pre-computed for SSR consistency)
const SPARKLES = [
  { left: '12%', top: '65%', delay: '0s', duration: '3s', size: 3 },
  { left: '28%', top: '72%', delay: '1.2s', duration: '2.5s', size: 2 },
  { left: '45%', top: '68%', delay: '0.5s', duration: '3.5s', size: 4 },
  { left: '62%', top: '75%', delay: '2s', duration: '2.8s', size: 2 },
  { left: '78%', top: '70%', delay: '0.8s', duration: '3.2s', size: 3 },
  { left: '90%', top: '66%', delay: '1.5s', duration: '2.6s', size: 2 },
  { left: '35%', top: '80%', delay: '2.5s', duration: '3s', size: 3 },
  { left: '55%', top: '82%', delay: '0.3s', duration: '2.7s', size: 2 },
  { left: '8%', top: '78%', delay: '1.8s', duration: '3.3s', size: 3 },
  { left: '72%', top: '85%', delay: '0.9s', duration: '2.4s', size: 2 },
];

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export default function HeroRiver() {
  const heroRef = useRef<HTMLElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleIdRef = useRef(0);
  const lastRippleTime = useRef(0);

  // Throttled ripple creation
  const createRipple = useCallback((clientX: number, clientY: number) => {
    const now = Date.now();
    if (now - lastRippleTime.current < 200) return; // 200ms throttle
    lastRippleTime.current = now;

    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const id = ++rippleIdRef.current;

    setRipples((prev) => [...prev.slice(-8), { id, x, y }]);

    // Auto-remove after animation
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 1200);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      createRipple(e.clientX, e.clientY);
    },
    [createRipple]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (touch) createRipple(touch.clientX, touch.clientY);
    },
    [createRipple]
  );

  // Check reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <section
      ref={heroRef}
      className="hero-river relative overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, #0F2D35 0%, #163F4A 40%, #1A4F5C 100%)',
      }}
      onMouseMove={!reducedMotion ? handleMouseMove : undefined}
      onTouchStart={!reducedMotion ? handleTouchStart : undefined}
    >
      {/* Animated wave layers */}
      {!reducedMotion && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Wave layer 1 — slowest, back */}
          <svg
            className="hero-wave hero-wave-1"
            viewBox="0 0 2880 320"
            preserveAspectRatio="none"
          >
            <path
              fill="rgba(255,255,255,0.04)"
              d="M0,224L120,213.3C240,203,480,181,720,181.3C960,181,1200,203,1440,218.7C1680,235,1920,245,2160,234.7C2400,224,2640,192,2760,181.3L2880,192L2880,320L2760,320C2640,320,2400,320,2160,320C1920,320,1680,320,1440,320C1200,320,960,320,720,320C480,320,240,320,120,320L0,320Z"
            />
          </svg>

          {/* Wave layer 2 — medium speed */}
          <svg
            className="hero-wave hero-wave-2"
            viewBox="0 0 2880 320"
            preserveAspectRatio="none"
          >
            <path
              fill="rgba(255,255,255,0.06)"
              d="M0,256L80,240C160,224,320,192,480,186.7C640,181,800,203,960,208C1120,213,1280,203,1440,186.7C1600,171,1760,149,1920,154.7C2080,160,2240,192,2400,202.7C2560,213,2720,203,2800,197.3L2880,192L2880,320L2800,320C2720,320,2560,320,2400,320C2240,320,2080,320,1920,320C1760,320,1600,320,1440,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"
            />
          </svg>

          {/* Wave layer 3 — fastest, front */}
          <svg
            className="hero-wave hero-wave-3"
            viewBox="0 0 2880 320"
            preserveAspectRatio="none"
          >
            <path
              fill="rgba(255,255,255,0.08)"
              d="M0,288L96,272C192,256,384,224,576,218.7C768,213,960,235,1152,245.3C1344,256,1536,256,1728,240C1920,224,2112,192,2304,186.7C2496,181,2688,203,2784,213.3L2880,224L2880,320L2784,320C2688,320,2496,320,2304,320C2112,320,1920,320,1728,320C1536,320,1344,320,1152,320C960,320,768,320,576,320C384,320,192,320,96,320L0,320Z"
            />
          </svg>

          {/* Wave layer 4 — accent color, subtle */}
          <svg
            className="hero-wave hero-wave-4"
            viewBox="0 0 2880 320"
            preserveAspectRatio="none"
          >
            <path
              fill="rgba(240,112,82,0.04)"
              d="M0,256L144,261.3C288,267,576,277,864,272C1152,267,1440,245,1728,240C2016,235,2304,245,2592,256C2736,261,2808,264,2880,267L2880,320L2808,320C2736,320,2592,320,2304,320C2016,320,1728,320,1440,320C1152,320,864,320,576,320C288,320,144,320,72,320L0,320Z"
            />
          </svg>

          {/* Water sparkles */}
          {SPARKLES.map((s, i) => (
            <span
              key={i}
              className="hero-sparkle"
              style={{
                left: s.left,
                top: s.top,
                width: s.size,
                height: s.size,
                animationDelay: s.delay,
                animationDuration: s.duration,
              }}
            />
          ))}
        </div>
      )}

      {/* Static topo pattern fallback for reduced motion */}
      {reducedMotion && (
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
          <svg
            className="absolute bottom-0 w-full"
            viewBox="0 0 1440 320"
            preserveAspectRatio="none"
          >
            <path
              fill="white"
              d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            />
          </svg>
        </div>
      )}

      {/* Ripple effects */}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="hero-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
          }}
        />
      ))}

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-24">
        <div className="flex items-center justify-between gap-8">
          <div className="flex-1 max-w-xl">
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mb-4"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Plan Your Next{' '}
              <br className="hidden sm:block" />
              <span style={{ color: '#F07052' }}>Float.</span>
            </h1>
            <p className="text-base md:text-lg text-white/80 max-w-lg mb-8 leading-relaxed">
              Real-time USGS gauge data, river analysis, and trip insights for
              paddlers, anglers, and float enthusiasts.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/rivers"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-white transition-all no-underline hover:brightness-110"
                style={{ backgroundColor: '#F07052' }}
              >
                Plan Your Float
              </Link>
              <Link
                href="/gauges"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-lg text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition-all no-underline"
              >
                River Reports
              </Link>
            </div>
          </div>

          {/* Otter mascot — floats on the waves */}
          <div className="flex-shrink-0 relative z-10">
            <div className={!reducedMotion ? 'animate-float' : ''}>
              <Image
                src={EDDY_CANOE}
                alt="Eddy the Otter"
                width={320}
                height={320}
                className="w-20 md:w-52 lg:w-64 h-auto drop-shadow-[0_8px_32px_rgba(240,112,82,0.25)]"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
