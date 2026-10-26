/** Presentation hint only: never changes cached data or assumes an app is installed. */
export function appDevice({ userAgent, platform, maxTouchPoints }: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): 'ios' | 'android' | 'other' {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios';
  return 'other';
}
