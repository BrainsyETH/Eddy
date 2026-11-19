// src/lib/lakes/weather.ts
// Wind and weather for a lake page, read at one named point.
//
// The point is the dam: its coordinates are the ones the dam registry already
// verified, and "Near Table Rock Dam" is a place a reader can find. A lake
// this size has more than one wind, which is why the place travels with the
// number (LakeWeather.place) instead of the lake's name standing in for it.
//
// Never throws. Weather is an optional card; an outage draws no card and the
// level and the launches still render.

import type { LakeWeather } from '@shared/lake-types';
import { fetchWeather, getWindDirection, type WeatherData } from '@/lib/weather/openweather';
import { logger } from '@/lib/logger';
import { poolDamFor, type LakeEntry } from './registry';

export function lakeWeatherFrom(weather: WeatherData, place: string): LakeWeather {
  return {
    place,
    windMph: weather.windSpeed,
    // A "gust" at or below the sustained wind says nothing a reader can use.
    ...(weather.windGust !== undefined && weather.windGust > weather.windSpeed ? { windGustMph: weather.windGust } : {}),
    windFrom: getWindDirection(weather.windDirection),
    tempF: weather.temp,
    condition: weather.condition,
    conditionIcon: weather.conditionIcon,
    ...(weather.observedAt ? { observedAt: weather.observedAt } : {}),
  };
}

export async function loadLakeWeather(lake: LakeEntry, apiKey = process.env.OPENWEATHER_API_KEY): Promise<LakeWeather | undefined> {
  const dam = poolDamFor(lake);
  if (!dam || !apiKey) return undefined;
  try {
    return lakeWeatherFrom(await fetchWeather(dam.lat, dam.lon, apiKey), `Near ${dam.name}`);
  } catch (error) {
    logger.warn('lake weather unavailable', { lake: lake.slug, error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}
