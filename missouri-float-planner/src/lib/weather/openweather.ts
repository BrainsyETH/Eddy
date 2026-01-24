// src/lib/weather/openweather.ts
// OpenWeatherMap API client for weather data

export interface WeatherData {
  temp: number;
  condition: string;
  conditionIcon: string;
  windSpeed: number;
  windDirection: number;
  humidity: number;
  city: string;
}

// Map river slugs to nearby cities for weather lookup
const RIVER_CITY_MAP: Record<string, { city: string; lat: number; lon: number }> = {
  'current': { city: 'Van Buren', lat: 36.9956, lon: -91.0146 },
  'meramec': { city: 'Steelville', lat: 37.9681, lon: -91.3543 },
  'eleven-point': { city: 'Alton', lat: 36.6942, lon: -91.3993 },
  'niangua': { city: 'Bennett Spring', lat: 37.7156, lon: -92.8564 },
  'jacks-fork': { city: 'Eminence', lat: 37.1481, lon: -91.3576 },
  'big-piney': { city: 'Licking', lat: 37.4992, lon: -91.8571 },
  'huzzah': { city: 'Steelville', lat: 37.9681, lon: -91.3543 },
  'courtois': { city: 'Steelville', lat: 37.9681, lon: -91.3543 },
};

export function getCityForRiver(riverSlug: string): { city: string; lat: number; lon: number } | null {
  return RIVER_CITY_MAP[riverSlug] || null;
}

export async function fetchWeather(
  lat: number,
  lon: number,
  apiKey: string
): Promise<WeatherData> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return {
    temp: Math.round(data.main.temp),
    condition: data.weather[0].main,
    conditionIcon: data.weather[0].icon,
    windSpeed: Math.round(data.wind?.speed || 0),
    windDirection: data.wind?.deg || 0,
    humidity: data.main.humidity,
    city: data.name,
  };
}

// Get wind direction as compass direction
export function getWindDirection(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}
