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

// ============================================
// 5-DAY FORECAST
// ============================================

export interface ForecastDay {
  date: string;
  dayOfWeek: string;
  tempHigh: number;
  tempLow: number;
  condition: string;
  conditionIcon: string;
  precipitation: number; // probability 0-100
  windSpeed: number;
  humidity: number;
}

export interface ForecastData {
  city: string;
  days: ForecastDay[];
}

/**
 * Fetches 5-day weather forecast from OpenWeatherMap
 */
export async function fetchForecast(
  lat: number,
  lon: number,
  apiKey: string
): Promise<ForecastData> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Forecast API error: ${response.statusText}`);
  }

  const data = await response.json();

  // Group forecasts by day and extract daily highs/lows
  const dailyData = new Map<string, {
    temps: number[];
    conditions: { main: string; icon: string; count: number }[];
    precipitation: number[];
    windSpeed: number[];
    humidity: number[];
  }>();

  for (const item of data.list) {
    const date = new Date(item.dt * 1000);
    const dateKey = date.toISOString().split('T')[0];

    if (!dailyData.has(dateKey)) {
      dailyData.set(dateKey, {
        temps: [],
        conditions: [],
        precipitation: [],
        windSpeed: [],
        humidity: [],
      });
    }

    const day = dailyData.get(dateKey)!;
    day.temps.push(item.main.temp);
    day.precipitation.push((item.pop || 0) * 100);
    day.windSpeed.push(item.wind?.speed || 0);
    day.humidity.push(item.main.humidity);

    // Track condition frequency to get most common
    const condition = item.weather[0];
    const existing = day.conditions.find(c => c.main === condition.main);
    if (existing) {
      existing.count++;
    } else {
      day.conditions.push({ main: condition.main, icon: condition.icon, count: 1 });
    }
  }

  // Convert to forecast days
  const days: ForecastDay[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (const [dateKey, dayData] of dailyData) {
    const date = new Date(dateKey);
    const mostCommonCondition = dayData.conditions.sort((a, b) => b.count - a.count)[0];

    days.push({
      date: dateKey,
      dayOfWeek: dayNames[date.getDay()],
      tempHigh: Math.round(Math.max(...dayData.temps)),
      tempLow: Math.round(Math.min(...dayData.temps)),
      condition: mostCommonCondition?.main || 'Unknown',
      conditionIcon: mostCommonCondition?.icon || '01d',
      precipitation: Math.round(Math.max(...dayData.precipitation)),
      windSpeed: Math.round(dayData.windSpeed.reduce((a, b) => a + b, 0) / dayData.windSpeed.length),
      humidity: Math.round(dayData.humidity.reduce((a, b) => a + b, 0) / dayData.humidity.length),
    });
  }

  // Limit to 5 days
  return {
    city: data.city?.name || 'Unknown',
    days: days.slice(0, 5),
  };
}
