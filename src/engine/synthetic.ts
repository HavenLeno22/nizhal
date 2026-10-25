// Idealised weather for tests and offline demos: a clear-sky day repeated, with
// a smooth temperature cycle. Not used for any real forecast.

import { CHENNAI, type Place } from './home';
import { sunPosition } from './solar';
import type { WeatherSeries } from './weather';

export interface SyntheticOptions {
  place?: Place;
  days?: number;
  spinupDays?: number;
  tMin?: number;
  tMax?: number;
  dewPoint?: number;
  wind?: number;
  cloud?: number;
  /** Multiply clear-sky sunlight (0 = no sun at all). */
  sun?: number;
  /** Local date of the first day, "YYYY-MM-DD". */
  date?: string;
}

/** Haurwitz clear-sky global irradiance, W/m². */
function haurwitz(cosZ: number): number {
  return cosZ > 0 ? 1098 * cosZ * Math.exp(-0.059 / cosZ) : 0;
}

export function syntheticWeather(o: SyntheticOptions = {}): WeatherSeries {
  const place = o.place ?? CHENNAI;
  const days = (o.days ?? 7) + (o.spinupDays ?? 3);
  const tMin = o.tMin ?? 29;
  const tMax = o.tMax ?? 38;
  const utcOffset = 19800;
  const startUtc = Date.parse(`${o.date ?? '2026-05-10'}T00:00:00Z`) - utcOffset * 1000;
  const H = days * 24;
  const w: WeatherSeries = {
    source: 'synthetic',
    place,
    startUtc,
    utcOffset,
    hours: H,
    spinupHours: (o.spinupDays ?? 3) * 24,
    temp: [],
    dewPoint: [],
    rh: [],
    wind: [],
    cloud: [],
    ghi: [],
    dni: [],
    dhi: [],
    runningMean30: (tMin + tMax) / 2,
  };
  const sunScale = o.sun ?? 1;
  for (let i = 0; i < H; i++) {
    const hour = i % 24;
    const t = (tMin + tMax) / 2 + ((tMax - tMin) / 2) * Math.cos((2 * Math.PI * (hour - 14.5)) / 24);
    const dp = Math.min(o.dewPoint ?? 24, t - 0.5);
    w.temp.push(t);
    w.dewPoint.push(dp);
    w.rh.push(100 * Math.exp((17.625 * dp) / (dp + 243.04) - (17.625 * t) / (t + 243.04)));
    w.wind.push(o.wind ?? 3);
    w.cloud.push(o.cloud ?? 10);
    // Radiation is the mean of the preceding hour: evaluate at its middle.
    const pos = sunPosition(startUtc + (i - 0.5) * 3_600_000, place.lat, place.lon);
    const cosZ = Math.cos((pos.zenith * Math.PI) / 180);
    const ghi = haurwitz(cosZ) * sunScale;
    const dhi = 0.12 * ghi;
    const dni = cosZ > 0.05 ? Math.min(1000, (ghi - dhi) / cosZ) : 0;
    w.ghi.push(ghi);
    w.dhi.push(dhi);
    w.dni.push(dni);
  }
  return w;
}
