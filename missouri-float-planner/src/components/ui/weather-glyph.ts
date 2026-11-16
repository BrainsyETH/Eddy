import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun, type LucideIcon } from 'lucide-react';

/** OpenWeather icon code (e.g. "10d") → the Lucide glyph Eddy draws for it. */
export function weatherGlyph(iconCode: string): LucideIcon {
  if (iconCode.startsWith('01')) return Sun;
  if (iconCode.startsWith('02')) return CloudSun;
  if (iconCode.startsWith('03') || iconCode.startsWith('04')) return Cloud;
  if (iconCode.startsWith('09') || iconCode.startsWith('10')) return CloudRain;
  if (iconCode.startsWith('11')) return CloudLightning;
  if (iconCode.startsWith('13')) return Snowflake;
  if (iconCode.startsWith('50')) return CloudFog;
  return CloudSun;
}
