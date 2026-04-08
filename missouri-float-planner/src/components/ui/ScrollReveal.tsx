'use client';

import { useEffect, useRef } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'up' | 'left' | 'scale';
  /** Add stagger delays to direct children */
  stagger?: boolean;
  /** IntersectionObserver threshold (0-1) */
  threshold?: number;
  /** Extra delay in ms before revealing */
  delay?: number;
}

export default function ScrollReveal({
  children,
  className = '',
  variant = 'up',
  stagger = false,
  threshold = 0.15,
  delay = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip if user prefers reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('revealed');
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          if (delay > 0) {
            setTimeout(() => el.classList.add('revealed'), delay);
          } else {
            el.classList.add('revealed');
          }
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, delay]);

  const variantClass =
    variant === 'left'
      ? 'scroll-reveal-left'
      : variant === 'scale'
        ? 'scroll-reveal-scale'
        : 'scroll-reveal';

  const staggerClass = stagger ? 'scroll-reveal-stagger' : '';

  return (
    <div ref={ref} className={`${variantClass} ${staggerClass} ${className}`}>
      {children}
    </div>
  );
}
