import type { Precip, Weather } from '../data/types';

/**
 * Weather is fetched on request and applied as a PROPOSAL, never silently.
 *
 * Auto-prefill would mutate rule inputs without the user noticing, which
 * destroys the mental model this app exists to build — and it degrades badly in
 * exactly the places the app gets used. So: an explicit action, a diff against
 * what is currently entered, and an accept/reject. See ADR-008.
 *
 * Open-Meteo needs no key and sets CORS headers, so this stays a static site.
 */

export interface WeatherProposal {
  weather: Weather;
  source: string;
  /** Human-readable list of what would change, for the accept/reject step. */
  changes: string[];
}

interface GeocodeHit {
  latitude: number;
  longitude: number;
  name: string;
  admin1?: string;
  country_code?: string;
}

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

export async function geocode(location: string, signal?: AbortSignal): Promise<GeocodeHit> {
  const url = `${GEOCODE}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not look up "${location}" (${response.status}).`);
  const body = (await response.json()) as { results?: GeocodeHit[] };
  const hit = body.results?.[0];
  if (!hit) throw new Error(`No place called "${location}" was found. Enter the weather by hand.`);
  return hit;
}

/** WMO weather codes collapsed onto our precipitation vocabulary. */
export function precipFromWmo(codes: number[]): Precip {
  if (codes.length === 0) return 'none';
  const has = (test: (c: number) => boolean) => codes.some(test);
  const snow = has((c) => (c >= 71 && c <= 77) || c === 85 || c === 86);
  const heavy = has((c) => c === 65 || c === 82 || c === 95 || c === 96 || c === 99);
  const rain = has((c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82));
  const cloudy = has((c) => c >= 1 && c <= 48);

  if (snow) return 'snow';
  if (heavy) return 'heavy';
  if (rain) {
    // Rain on some days but not others is a different packing problem from
    // rain throughout: it is the one where you need everything.
    const dry = codes.filter((c) => c < 51).length;
    return dry >= codes.length / 2 ? 'changeable' : 'rain';
  }
  if (cloudy) return 'possible';
  return 'none';
}

export async function fetchWeather(
  location: string,
  startDate: string,
  endDate: string,
  current: Weather,
  signal?: AbortSignal,
): Promise<WeatherProposal> {
  const place = await geocode(location, signal);
  const url =
    `${FORECAST}?latitude=${place.latitude}&longitude=${place.longitude}` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max` +
    `&start_date=${startDate}&end_date=${endDate}&timezone=auto`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      response.status === 400
        ? 'Those dates are outside the forecast window. Enter the weather by hand.'
        : `The forecast service returned ${response.status}. Enter the weather by hand.`,
    );
  }

  const body = (await response.json()) as {
    daily?: {
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
      weather_code: (number | null)[];
      wind_speed_10m_max: (number | null)[];
    };
  };
  const daily = body.daily;
  if (!daily?.temperature_2m_min?.length) {
    throw new Error('The forecast came back empty. Enter the weather by hand.');
  }

  const nums = (values: (number | null)[]) => values.filter((v): v is number => v !== null);
  const lows = nums(daily.temperature_2m_min);
  const highs = nums(daily.temperature_2m_max);
  const winds = nums(daily.wind_speed_10m_max);

  // The coldest night and the warmest day, not the averages: you pack for the
  // extremes of the trip, not its mean.
  const weather: Weather = {
    precip: precipFromWmo(nums(daily.weather_code)),
    overnightLow: lows.length ? Math.round(Math.min(...lows)) : current.overnightLow,
    daytimeHigh: highs.length ? Math.round(Math.max(...highs)) : current.daytimeHigh,
    windKph: winds.length ? Math.round(Math.max(...winds)) : current.windKph,
  };

  const changes: string[] = [];
  if (weather.precip !== current.precip)
    changes.push(`precipitation ${current.precip} → ${weather.precip}`);
  if (weather.overnightLow !== current.overnightLow)
    changes.push(`overnight low ${current.overnightLow}°C → ${weather.overnightLow}°C`);
  if (weather.daytimeHigh !== current.daytimeHigh)
    changes.push(`daytime high ${current.daytimeHigh}°C → ${weather.daytimeHigh}°C`);
  if (weather.windKph !== current.windKph)
    changes.push(`wind ${current.windKph} → ${weather.windKph} km/h`);

  const where = [place.name, place.admin1, place.country_code].filter(Boolean).join(', ');
  return { weather, source: `Open-Meteo, ${where}`, changes };
}
