/**
 * Daylight for a latitude and date.
 *
 * The location field should not be a dead text box. The number that actually
 * changes behaviour is how much light is left when you arrive: setting up in
 * the dark with tired kids is a different trip from setting up at six.
 *
 * NOAA's solar position approximation, which is well inside a minute for the
 * latitudes this app cares about.
 */

export interface Daylight {
  sunriseMinutes: number;
  sunsetMinutes: number;
  hours: number;
}

const RAD = Math.PI / 180;

function dayOfYear(dateISO: string): number {
  const date = new Date(`${dateISO}T12:00:00Z`);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

export function daylightFor(latitude: number, dateISO: string): Daylight | null {
  const n = dayOfYear(dateISO);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Solar declination.
  const declination =
    23.45 * RAD * Math.sin(((2 * Math.PI) / 365) * (n - 81));

  const cosHourAngle =
    -Math.tan(latitude * RAD) * Math.tan(declination);

  // Polar day or polar night: no sunrise or sunset to report.
  if (cosHourAngle <= -1) return { sunriseMinutes: 0, sunsetMinutes: 1440, hours: 24 };
  if (cosHourAngle >= 1) return { sunriseMinutes: 0, sunsetMinutes: 0, hours: 0 };

  const hourAngle = Math.acos(cosHourAngle) / RAD;
  const hours = (2 * hourAngle) / 15;
  const noon = 12 * 60;
  const half = (hours / 2) * 60;

  return {
    sunriseMinutes: Math.round(noon - half),
    sunsetMinutes: Math.round(noon + half),
    hours: Math.round(hours * 10) / 10,
  };
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Arrival light. Solar noon here is local noon, so this is a planning
 * approximation rather than a clock — good enough to answer "will we be
 * pitching in the dark", which is the question.
 */
export function arrivalLight(
  latitude: number,
  dateISO: string,
  departureHour: number,
  driveHours: number,
): { arrivesAt: number; minutesOfLightLeft: number; setupInDark: boolean } | null {
  const light = daylightFor(latitude, dateISO);
  if (!light) return null;
  const arrivesAt = (departureHour + driveHours) * 60;
  const minutesOfLightLeft = Math.round(light.sunsetMinutes - arrivesAt);
  return {
    arrivesAt,
    minutesOfLightLeft,
    // Pitching a tent and cooking takes about ninety minutes with kids.
    setupInDark: minutesOfLightLeft < 90,
  };
}
