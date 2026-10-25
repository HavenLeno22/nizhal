// Weather input for the twin, from Open-Meteo (https://open-meteo.com, CC BY 4.0):
// the forecast API for the coming days and the ERA5 archive for past summers.

import type { Place } from './home';

export type WeatherSource = 'forecast' | 'archive' | 'sample' | 'synthetic';

export interface WeatherSeries {
  source: WeatherSource;
  place: Place;
  /** UTC milliseconds of the first hourly record. */
  startUtc: number;
  /** Local time offset from UTC, seconds (19800 for India). */
  utcOffset: number;
  hours: number;
  /** Leading hours used only to warm the model up (not shown). */
  spinupHours: number;
  /** Air temperature, °C. */
  temp: number[];
  /** Dew point, °C. */
  dewPoint: number[];
  /** Relative humidity, %. */
  rh: number[];
  /** Wind speed at 10 m, m/s. */
  wind: number[];
  /** Cloud cover, %. */
  cloud: number[];
  /** Global horizontal, direct normal and diffuse horizontal irradiance, W/m² (mean of the preceding hour). */
  ghi: number[];
  dni: number[];
  dhi: number[];
  /** 30-day outdoor running mean before the shown period, °C (for IMAC comfort). */
  runningMean30: number;
  /** Optional label, e.g. "Hottest week of summer 2026". */
  label?: string;
}

const HOURLY = 'temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,cloud_cover,shortwave_radiation,direct_normal_irradiance,diffuse_radiation';

interface OpenMeteoHourly {
  time: string[];
  temperature_2m: (number | null)[];
  relative_humidity_2m: (number | null)[];
  dew_point_2m: (number | null)[];
  wind_speed_10m: (number | null)[];
  cloud_cover: (number | null)[];
  shortwave_radiation: (number | null)[];
  direct_normal_irradiance: (number | null)[];
  diffuse_radiation: (number | null)[];
}

interface OpenMeteoResponse {
  utc_offset_seconds: number;
  elevation?: number;
  hourly: OpenMeteoHourly;
}

type Fetcher = (url: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service replied ${res.status}`);
  return res.json();
};

/** Fills gaps (null) by carrying the last value forward, then backward. */
function clean(values: (number | null)[], fallback: number): number[] {
  const out = new Array<number>(values.length);
  let last: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) last = v;
    out[i] = last ?? NaN;
  }
  let next: number | null = null;
  for (let i = values.length - 1; i >= 0; i--) {
    if (Number.isFinite(out[i])) next = out[i];
    else out[i] = next ?? fallback;
  }
  return out;
}

export function parseOpenMeteo(json: OpenMeteoResponse, place: Place, source: WeatherSource): WeatherSeries {
  const h = json.hourly;
  const offset = json.utc_offset_seconds ?? 0;
  const startUtc = Date.parse(`${h.time[0]}:00Z`) - offset * 1000;
  const temp = clean(h.temperature_2m, 30);
  return {
    source,
    place: { ...place, elevation: place.elevation ?? json.elevation },
    startUtc,
    utcOffset: offset,
    hours: h.time.length,
    spinupHours: 0,
    temp,
    rh: clean(h.relative_humidity_2m, 60),
    dewPoint: clean(h.dew_point_2m, 20),
    // Open-Meteo gives km/h by default.
    wind: clean(h.wind_speed_10m, 8).map((v) => v / 3.6),
    cloud: clean(h.cloud_cover, 30),
    ghi: clean(h.shortwave_radiation, 0).map((v) => Math.max(0, v)),
    dni: clean(h.direct_normal_irradiance, 0).map((v) => Math.max(0, v)),
    dhi: clean(h.diffuse_radiation, 0).map((v) => Math.max(0, v)),
    runningMean30: mean(temp),
  };
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length;
}

/** Keep hours [from, to) of a series, as a new series. */
export function sliceSeries(w: WeatherSeries, from: number, to: number, spinupHours: number): WeatherSeries {
  const s = <T>(a: T[]) => a.slice(from, to);
  return {
    ...w,
    startUtc: w.startUtc + from * 3_600_000,
    hours: to - from,
    spinupHours,
    temp: s(w.temp),
    dewPoint: s(w.dewPoint),
    rh: s(w.rh),
    wind: s(w.wind),
    cloud: s(w.cloud),
    ghi: s(w.ghi),
    dni: s(w.dni),
    dhi: s(w.dhi),
  };
}

/**
 * The next `days` days plus 30 past days (for the comfort running mean and to
 * warm the model up), from the Open-Meteo forecast API.
 */
export async function fetchForecast(place: Place, days = 7, fetcher: Fetcher = defaultFetcher): Promise<WeatherSeries> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(4)}&longitude=${place.lon.toFixed(4)}` +
    `&hourly=${HOURLY}&timezone=auto&past_days=30&forecast_days=${days}`;
  const json = (await fetcher(url)) as OpenMeteoResponse;
  const full = parseOpenMeteo(json, place, 'forecast');
  // Show from local midnight today; the 30 past days give the running mean and spin-up.
  const nowLocal = Date.now() + full.utcOffset * 1000;
  const todayStartUtc = Math.floor(nowLocal / 86_400_000) * 86_400_000 - full.utcOffset * 1000;
  const startIdx = Math.max(72, Math.round((todayStartUtc - full.startUtc) / 3_600_000));
  const running = mean(full.temp.slice(Math.max(0, startIdx - 720), startIdx));
  const spin = 72;
  const out = sliceSeries(full, startIdx - spin, full.hours, spin);
  out.runningMean30 = running;
  return out;
}

/** The last 31 days up to now (for calibrating against thermometer readings). */
export async function fetchRecent(place: Place, fetcher: Fetcher = defaultFetcher): Promise<WeatherSeries> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(4)}&longitude=${place.lon.toFixed(4)}` +
    `&hourly=${HOURLY}&timezone=auto&past_days=31&forecast_days=1`;
  const json = (await fetcher(url)) as OpenMeteoResponse;
  const w = parseOpenMeteo(json, place, 'forecast');
  w.spinupHours = 0;
  return w;
}

/** The most recent pre-monsoon season (March–June) that is complete. */
export function lastSummerYear(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** Index of the hottest `days`-day window by mean daily maximum temperature. */
export function hottestWindow(temp: number[], days: number, earliestStart: number): number {
  const dailyMax: number[] = [];
  for (let d = 0; d * 24 + 24 <= temp.length; d++) {
    let m = -Infinity;
    for (let h = 0; h < 24; h++) m = Math.max(m, temp[d * 24 + h]);
    dailyMax.push(m);
  }
  const firstDay = Math.ceil(earliestStart / 24);
  let best = firstDay;
  let bestScore = -Infinity;
  for (let d = firstDay; d + days <= dailyMax.length; d++) {
    let s = 0;
    for (let k = 0; k < days; k++) s += dailyMax[d + k];
    if (s > bestScore) {
      bestScore = s;
      best = d;
    }
  }
  return best * 24;
}

/**
 * The hottest week of last summer at a place, from the ERA5 archive, with three
 * days of warm-up before it and the 30-day running mean for comfort.
 */
export async function fetchHottestWeek(place: Place, year = lastSummerYear(), fetcher: Fetcher = defaultFetcher): Promise<WeatherSeries> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${place.lat.toFixed(4)}&longitude=${place.lon.toFixed(4)}` +
    `&start_date=${year}-02-01&end_date=${year}-06-30&hourly=${HOURLY}&timezone=auto`;
  const json = (await fetcher(url)) as OpenMeteoResponse;
  const full = parseOpenMeteo(json, place, 'archive');
  return hottestWeekFrom(full, year);
}

export function hottestWeekFrom(full: WeatherSeries, year: number): WeatherSeries {
  // Search from 1 March (≈ 28 days in) so there are always 30 days before the window.
  const start = hottestWindow(full.temp, 7, 24 * 28);
  const spin = 72;
  const running = mean(full.temp.slice(Math.max(0, start - 720), start));
  const out = sliceSeries(full, start - spin, Math.min(full.hours, start + 7 * 24), spin);
  out.runningMean30 = running;
  out.label = `hottest-week-${year}`;
  return out;
}

export interface GeoResult extends Place {
  id: number;
}

export async function geocode(query: string, language = 'en', fetcher: Fetcher = defaultFetcher): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=${language}&format=json`;
  const json = (await fetcher(url)) as {
    results?: { id: number; name: string; latitude: number; longitude: number; elevation?: number; admin1?: string; country?: string }[];
  };
  return (json.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    elevation: r.elevation,
    admin: r.admin1,
    country: r.country,
  }));
}

/** Local hour of day (0–23) for hour index i of a series. */
export function localHour(w: WeatherSeries, i: number): number {
  const ms = w.startUtc + i * 3_600_000 + w.utcOffset * 1000;
  return new Date(ms).getUTCHours();
}

/** Local date key "YYYY-MM-DD" for hour index i. */
export function localDay(w: WeatherSeries, i: number): string {
  const ms = w.startUtc + i * 3_600_000 + w.utcOffset * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
