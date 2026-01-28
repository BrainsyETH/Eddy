// src/hooks/useDebounce.ts
// Performance optimization: Debounce rapidly changing values

import { useEffect, useState } from 'react';

/**
 * Debounce a value to prevent excessive re-renders or API calls
 * 
 * Example:
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 500ms)
 * @returns Debounced value
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before delay expires
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Throttle a callback function to prevent excessive execution
 * 
 * Example:
 * const handleScroll = useThrottle(() => {
 *   console.log('Scrolling...');
 * }, 200);
 * 
 * @param callback - Function to throttle
 * @param delay - Minimum time between executions (default: 200ms)
 * @returns Throttled callback
 */
export function useThrottle<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number = 200
): T {
  const [lastRun, setLastRun] = useState(Date.now());

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastRun >= delay) {
      setLastRun(now);
      return callback(...args);
    }
  }) as T;
}
