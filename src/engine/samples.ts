// Built-in weather: the hottest week of last summer for 14 Indian cities
// (Open-Meteo ERA5 archive, CC BY 4.0), so Nizhal works offline and in demos.

import type { Place } from './home';
import type { WeatherSeries } from './weather';

export interface SampleCity {
  id: string;
  place: Place;
  startUtc: number;
  utcOffset: number;
  hours: number;
  spinupHours: number;
  runningMean30: number;
  label?: string;
  temp: number[];
  dewPoint: number[];
  rh: number[];
  wind: number[];
  cloud: number[];
  ghi: number[];
  dni: number[];
  dhi: number[];
}

export interface SampleFile {
  year: number;
  source: string;
  cities: SampleCity[];
}

export function sampleToSeries(c: SampleCity): WeatherSeries {
  return {
    source: 'sample',
    place: c.place,
    startUtc: c.startUtc,
    utcOffset: c.utcOffset,
    hours: c.hours,
    spinupHours: c.spinupHours,
    temp: c.temp,
    dewPoint: c.dewPoint,
    rh: c.rh,
    wind: c.wind,
    cloud: c.cloud,
    ghi: c.ghi,
    dni: c.dni,
    dhi: c.dhi,
    runningMean30: c.runningMean30,
    label: c.label,
  };
}

let cache: SampleFile | null = null;

/** Loads the samples lazily so they don't weigh down the first page load. */
export async function loadSamples(): Promise<SampleFile> {
  if (cache) return cache;
  const mod = (await import('../data/samples.json')) as unknown as { default: SampleFile };
  cache = mod.default;
  return cache;
}

/** Great-circle distance, km. */
export function distanceKm(a: Place, b: Place): number {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function nearestSample(file: SampleFile, place: Place): SampleCity {
  let best = file.cities[0];
  let bd = Infinity;
  for (const c of file.cities) {
    const d = distanceKm(c.place, place);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
